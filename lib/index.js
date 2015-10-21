var follow = require('follow');
var EventEmitter = require('events').EventEmitter;
var async = require('async');
var Q = require('kew');
var pgescape = require('pg-escape');


function PostgresCouchDB(pgclient, options) {

        var opts = set_options(options);
        var events = new EventEmitter();

        var changecount = opts.couchdb.since;
        if(changecount < 0) changecount = 0;
        var previous_since = changecount;

//console.error('start changecount', opts.couchdb.since, changecount, previous_since);

        var alive = true;
        var status = '';

        function set_options(opts) {
            opts = opts || {};
            opts.couchdb = opts.couchdb || {};
            return {
                couchdb: {
                    url: opts.couchdb.url || process.env.COUCHDB_URL || 'http://localhost:5984',
                    username: opts.couchdb.username || process.env.COUCHDB_USERNAME,
                    password: opts.couchdb.password || process.env.COUCHDB_PASSWORD,
                    database: opts.couchdb.database || process.env.COUCHDB_DATABASE,
                    since: opts.couchdb.since || 0,
                    pgtable: (opts.couchdb.pgtable || process.env.PGTABLE).replace(/\-/g,"_")
                },
                map: opts.map || null
            };
        }
        var pgtable = opts.couchdb.pgtable;


        var queue = async.queue(process_change, 1);
        queue.drain = function() {
            events.emit('drain', opts.couchdb.pgtable + ': drain');
        };

        var db_url = [opts.couchdb.url, opts.couchdb.database].join('/');
        var auth;
        if (opts.couchdb.username && opts.couchdb.password) {
            auth = 'Basic ' + new Buffer([opts.couchdb.username, opts.couchdb.password].join(':')).toString('base64');
        }
        var stream = new follow.Feed({
            db: [opts.couchdb.url, opts.couchdb.database].join('/'),
            include_docs: true
        });


	setTimeout(function() {
 	    events.emit('checkpoint', opts.couchdb.pgtable + ': Starting checkpointer');
            checkpoint_changes(changecount)
	}, 1000);


        function checkpoint_changes(last_changecount) {
	    var ckwait = 20 * 1000;
	    var mychangecount = changecount;
	    if(alive){

//console.error('in checkpoint_changes', last_changecount, changecount);

		if(last_changecount < mychangecount){
		    //do insert into stats table here?
		    //maybe something like (changecount - last_changecount), NOW()
		    //then we only collect stats when there is a change and can assume 0 changes otherwise
		    //can then work out changes/sec etc
		    //at the moment not possible todo stats on what type of change
		    //   need to add to update and destroy then dont collect (changecount - last_changecount) as can be calculated
	            pgclient.query("UPDATE since_checkpoints SET since=" + mychangecount + " WHERE pgtable='" + pgtable + "'", function(err, result) {
        	        if (err) {
                            //catch postgres disconnects and other errors?
                	    events.emit('checkpoint.error', pgtable + ": UNABLE TO SET SINCE CHECKPOINT to " + mychangecount, err);
	                } else {
	                    events.emit('checkpoint', pgtable + ': Checkpoint set to ' + mychangecount + ' next check in ' +  (ckwait / 1000) + " seconds");
	                }
	            });
		}else{
	      //       ckwait = Math.floor(Math.random() * ((60000*2) - 30000) + 30000)
		     ckwait = 120 * 1000; //increase wait as may be idle for a while - adjust to suite needs
	             events.emit('checkpoint', pgtable + ": Checkpoint " + mychangecount + ' is current next check in: ' +  Math.floor(ckwait / 1000) + ' seconds');
		}
		previous_since = mychangecount; //for /_status
		setTimeout(function() {
			checkpoint_changes(previous_since)
		     }, ckwait);
	    }
        }

        function update(pgtable, key, doc) {
            var deferred = Q.defer();
	    var sql = '';
	    sql = "SELECT doc->>'_rev' as rev FROM " + pgtable + " WHERE id='" + key + "'";
            pgclient.query(sql, function(err, result) {
                if (err) {
                    //console.error(pgtable, err);
                    deferred.reject(err);
                } else {
                    //i think may be better to just check full revs and update if different.
                    if (result.rows.length > 0) {
                        doc_rev_num = doc._rev.split('-')[0];
                        pg_rev_num = result.rows[0].rev.split('-')[0];

                        if (doc._rev != result.rows[0].rev) {
                               // console.log(pgtable + ": update " + doc._id + " pg_rev: " + pg_rev_num + " < doc_rev: " + doc_rev_num);

                                json_doc = pgescape.literal(JSON.stringify(doc));
	                        sql = "UPDATE " + pgtable + " SET doc=" + json_doc + " WHERE id='" + key + "'";
	                        pgclient.query(sql, function(err, result) {
                        	    if (err) {
                	                console.error(pgtable + ": " + sql, err);
        	                        deferred.reject(err);
	                            } else {
                      //  	        console.log(pgtable + ": " + key + " updated _rev: " + doc._rev);
	                                deferred.resolve(doc._id + ' ' + doc._rev);
        	                    }
	                        });

                        }else{
                                //console.log(pgtable + ": NOOP " + doc._id + " pg_rev: " + pg_rev_num + " = doc_rev: " + doc_rev_num);
                                deferred.resolve(doc._id + ' ' + doc._rev);
			}
                    } else {
                        //new doc need to add
                        if (doc.type != "Harms::AttachmentAccessingLogXXXX") {
                            json_doc = pgescape.literal(JSON.stringify(doc));
                            sql = "INSERT INTO " + pgtable + " (id, doc) VALUES ('" + key + "', " + json_doc + ")";
                            pgclient.query(sql, function(err, result) {
                                if (err) {
                                    //console.error(pgtable + ": " + ' ' + sql, err);
                                    deferred.reject(err);
                                } else {
                                  //  console.log(pgtable + ": " + doc._id + " added");
                                    deferred.resolve(doc._id);
                                }
                            });
                        } else {
                            //console.log(pgtable + ": " + doc._id + " is " + doc.type + "ignoring");
                            deferred.resolve('ignoring');
                        }
                    }
                }
            });
            return deferred.promise;
        }


        function destroy(pgtable, key) {
            var deferred = Q.defer();
            //show we first check if there is a record to delete - does this matter?

            pgclient.query("SELECT id FROM " + pgtable + " WHERE id='" + key + "'", function(err, result) {
                if (err) {
                    //console.error(pgtable, err);
                    deferred.reject(err);
                } else {
                    if (result.rows.length > 0) {
                        sql = "DELETE FROM " + pgtable + " WHERE id='" + key + "'";
                        pgclient.query(sql, function(err, result) {
                            if (err) {
                                console.err(pgtable + ": " + sql, err);
                                deferred.reject(err);
                            } else {
                                console.log(pgtable + ": " + key + " deleted");
                                deferred.resolve(result.rowCount);
                            }
                        });
                    } else {
                        //console.log(pgtable + ": " + key + " does not exist nothing to delete");
                        deferred.resolve('nothing to delete');
                    }
                }
            });
            return deferred.promise;
        }

        function process_change(change, done) {
            var promise;
            var deletion = !!change.deleted;
            var doc = change.doc;

            if (opts.map) {
                doc = opts.map(doc);
            }

            if (deletion) {
                promise = destroy(opts.couchdb.pgtable, change.id);
            } else {
                promise = update(opts.couchdb.pgtable, change.id, doc);
            }
            promise
                .then(function(res, body) {
                    events.emit('change', change);
                    events.emit('change.success', change);
                    done();
                })
                .fail(function(err) {

                  if (err.code == "EPIPE") { //pg gone away -
                    console.error('Error EPIPE:' + opts.couchdb.pgtable + ' in change');
                    status = 'Error: EPIPE';
                    //events.emit('error', opts.couchdb.pgtable + ': EPIPE', err);
                    stopFollowing();
                  } else if (err.code == '42P01'){
                     console.error('Error 42P01:' + opts.couchdb.pgtable + ' in change');
                     status = 'Error: table not found in postgres datebase';
                     stopFollowing();
//                  } else if (err.code == '57P01'){      //not able to catch here
//                     console.error('Error 57P01:' + opts.couchdb.pgtable + ' in change');
//                     status = 'Error: 57P01';
//                     stopFollowing();
                } else if (err.code == "ECONNRESET") { //pg gone away - cant catch here for some reason - try in changes.error
                    status = 'Error: ECONNRESET';
                    stopFollowing();
                     console.error('Error ECONNRESET:' + opts.couchdb.pgtable + ' in change');

               } else if (err.code == 'ECONNREFUSED') { //couchdb error
                    status = 'Error: Not connected to couch server trying to reconnect.';
                    wait = Math.floor(Math.random() * (60000 - 10000) + 10000); //mixup wait time as could be many
                    console.error('Error ECONNREFUSED:' + opts.couchdb.pgtable + ' in change');
                    setTimeout(function() {
                        stream.restart();
                    }, wait);
                 }
                  events.emit('change', change, err);
                  events.emit('change.error', opts.couchdb.pgtable, change, err);
                  done(err);
              });

            changecount++;
            //if (changecount % 500 == 0) {
            //    checkpoint_changes(opts.couchdb.pgtable, changecount);
            //}
        }


        function startFollowing() {

            if (auth) stream.headers.Authentication = auth;

            stream.since = previous_since;
            stream.inactivity_ms = 30000;
            // stream.heartbeat = 10000;

            stream.on('confirm', function(db_info) {
                //console.log(JSON.stringify(db_info));
                events.emit('connect', opts.couchdb.pgtable + ': ' + JSON.stringify(db_info));
                status = "Following";
            });
            stream.on('change', function(change) {
                events.emit('change', opts.couchdb.pgtable + ': ' + change);
                events.emit('change.start', opts.couchdb.pgtable + ': ' + change);
                // pause the stream
                stream.pause();
                queue.push(change, function() {
                    // unpause the stream
                    stream.resume();
                });
            });
            stream.on('error', function(err) {
                if (err.code == 'ECONNREFUSED') { //couchdb error
                    status = 'Error: Not connected to couch server trying to reconnect.';
                    wait = Math.floor(Math.random() * (60000 - 10000) + 10000); //mixup wait time as could be many
                    events.emit('error', opts.couchdb.pgtable + ': Error connection refused. Sleeping for: ' + Math.floor(wait / 1000) + ' seconds', err);
                    setTimeout(function() {
                        stream.restart();
                    }, wait);
                } else if (err.toString().indexOf("no_db_file") > 0) { //couchdb error
                    status = 'Error: db not found on couch server';
                    events.emit('error', opts.couchdb.pgtable + ': couchdb not found', err);
                    stopFollowing();
                } else {
                    status = 'unknown';
                    events.emit('error', opts.couchdb.pgtable + ': stream.on error #' + err + '#', err);
                }
            });

            stream.follow();
            //  events.stop = stream.stop.bind(stream);
            //  return events;

	   //TODO: set started_on -like couch rep status page
           //      also last update?
        }


        function stopFollowing() {
            console.log(opts.couchdb.pgtable + ': stopping stream');
            stream.stop();
            stream.removeAllListeners();
            events.emit('stop', opts.couchdb.pgtable);
            events.removeAllListeners();
            status = 'stopped';
            alive = false;
        }





        function is_alive() {
            return alive;
        }
        function get_status() {
            return status;
        }
        function get_since () {
            return changecount;
	}
        function get_since_checkpoint () {
            return previous_since;
	}


        return {
            events: events,
            alive: function alive() {
                return is_alive()
            },
            status: function () {
                return get_status()
            },
            since: function () {
                return get_since()
            },
            since_checkpoint: function () {
                return get_since_checkpoint()
            },
            start: function start() {
                return startFollowing()
            },
            stop: function stop() {
                return stopFollowing()
            }
        };
        //  return events;

    }
    //
    //PostgresCouchDB.prototype.is_alive = function (){
    //}

module.exports = PostgresCouchDB;

//module.exports = { 'PostgresCouchDB': PostgresCouchDB };
