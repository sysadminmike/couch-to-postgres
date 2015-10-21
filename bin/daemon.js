#!/usr/bin/env node

var Q = require('kew');
var pg = require('pg');
var PostgresCouchDB = require('../lib');
var DaemonSettings = require('../config/daemon.js');

var daemon_settings = new DaemonSettings();

var PostgresCouchContainer = [];


var control_port = 8888;

//how often do we check pgtables for new records
var findfeeds_interval = (60 * 1000) * 1;  //15 mins - can force a find at /_finder

//how often should watchdog  run
var feedswatchdog_interval = 50 * 1000;  //50 secs - can force watchdog at: /_watchdog
var pgwatchdog_interval = 10 * 1000;  //10 secs - can force watchdog at: /_watchdog

var find_once  = false; //stop finder calling itself if invoked via http
var watch_once = false; //stop watchdog calling itself if invoked via http
var postgres_dead = true;

/*
note: if the db in couch is not found then the feed alive is set to false
the watchdog will reap this feed but it will get re-added the next
time findFeeds executes.
*/

var pgclient = '';

function pgClientUrl() {
  var url_prefix = "postgres://" + daemon_settings["postgres"]["username"];

  var pg_pass = daemon_settings["postgres"]["password"];
  var url_optional_pass = pg_pass ? (":" + pg_pass) : "";

  var url_postfix = "@" + daemon_settings["postgres"]["host"] +
                    "/" + daemon_settings["postgres"]["database"];

  return (url_prefix + url_optional_pass + url_postfix);
};

function connectPostgres(do_one_find){
    if(postgres_dead == true){
  pg_client_url = pgClientUrl();
	pgclient = new pg.Client(pg_client_url);
	pgclient.connect(function(err) {
	    if (err) {
                if(err.code == 'ECONNREFUSED'){ //try to catch here but i dont think works
		        console.error('ERROR: Connection to postgres refused', err);
		}else{
		        console.error('ERROR: Could not connect to postgres', err);
                }
	        postgres_dead = true;
//	        process.exit();
	    } else {
	        console.log('Connected to postgres');
	        postgres_dead = false;  //this should be the only place we set this to false
                if(do_one_find==true){
		        setTimeout(function() {
		            //console.log('');
        		    findFeeds(true)
		        }, 3000);
		}
	    }
	});
  }else{
	console.error('Postgres client reconnect called when postgres_alive=true', err);
  }
}

process.on('uncaughtException', function (err) {
  if (err.code == 'ECONNREFUSED'){ //not sure where this one come from postgres or couch - i think socket lib err so is the same for pg & couch
        console.error('ERROR: ECONNREFUSED - Node NOT Exiting...');
//        postgres_dead = true; // we dont know this for sure - may have been set somewhere else
	feedsWatchdog(true); //should kill all feeds

  }else if ( (err.code=='ECONNRESET') |
       (err.code=='ECONNABORTED') |
       (err.file=='postgres.c' & err.severity=='FATAL')

     ){
	console.error("Postgresl connection died - Node NOT Exiting...",err);
        postgres_dead = true;
	feedsWatchdog(true); //should kill all feeds
  }else{
	console.error('UNKNOWN ERR - exiting',err);
 	//perhaps make a shutdown function
	process.exit();
  }
});

function findFeeds(find_once) {
    if(postgres_dead == false){
     if(find_once == true){
       console.log('FINDER: One off find started.');
     }else{
       console.log('FINDER: Started');
     }
     var sql = "SELECT pgtable, since FROM since_checkpoints WHERE enabled=True ORDER BY pgtable";
     pgclient.query(sql, function(err, result) {
        if (err) {
            console.error("FINDER: Could not get pgtables and checkpoints with: " + sql, err);
            process.exit();
        } else {
            var pgtable;
            var couchdb;

            console.log("FINDER: " + result.rows.length + ' dbs to check found');
            for (var i = 0; i < result.rows.length; i++) {
                couchdb = result.rows[i].pgtable;
                pgtable = couchdb.replace(/\-/g,"_");

                if (PostgresCouchContainer[pgtable] === undefined) {
                    pgtableCheck(pgtable);

                    PostgresCouchContainer[pgtable] = new PostgresCouchDB(pgclient, {
                        couchdb: {
                            url: daemon_settings["couchdb"]["url"],
                            pgtable: pgtable,
                            since: result.rows[i].since,
                            database: couchdb
                        }
                    });

                    PostgresCouchContainer[pgtable].start();
                    console.log('FINDER: Found ' + pgtable + ' processing changes since: ' + result.rows[i].since);

                    PostgresCouchContainer[pgtable].events.on('connect', console.log);
		  
                    PostgresCouchContainer[pgtable].events.on('checkpoint', console.log);  //Comment out if too much info
                    PostgresCouchContainer[pgtable].events.on('checkpoint.error', function(msg, err) {
                        console.error(msg, err);
                        process.exit(1);
                    });

                    //PostgresCouchContainer[pgtable].events.on('change', console.log);
                    PostgresCouchContainer[pgtable].events.on('change.error', function(tbl, change, err) {
                        console.error(tbl, err.body, err);
                    });

                    PostgresCouchContainer[pgtable].events.on('error', function(msg, err) { console.error(msg, err); });

                    //PostgresCouchContainer[pgtable].events.on('drain', console.log);

                    PostgresCouchContainer[pgtable].events.on('stop', function(key) {
                        console.log(key + ': stopped');
                    });
                } //undefined check
            } //for loop
        }
     }); //pgclient
    } else {
       console.log('FINDER: postgres is dead');

    }
    if(find_once == false){
	    setTimeout(function() {
	        findFeeds(false);
	    }, findfeeds_interval);
    }
}


function reaperCheck(tbl) {

    if(postgres_dead == true){
                PostgresCouchContainer[tbl].stop();
                console.error('WATCHDOG: ' + tbl + ' postgres dead feed stopped');
    }else{
      var sql = "SELECT pgtable FROM since_checkpoints WHERE pgtable='" + tbl + "' AND enabled=True";
      pgclient.query(sql, function(err, result) {
        if (err) {
            console.error("WATCHDOG: Could not get pgtables with: " + sql, err);
            process.exit();
        } else {
            if (result.rows.length == 0) {
                PostgresCouchContainer[tbl].stop();
                console.error('WATCHDOG: ' + tbl + ' feed stopped');
            }else{
		console.error('WATCHDOG: ' + tbl + ' ok');
	    }
        }
      });
    }
}

function feedsWatchdog(watch_once) {
    var pgtbl;
    if(watch_once == true){
       console.log('WATCHDOG: One off watch started.');
    }else{
       console.log('WATCHDOG: Started');
    }
    for (var pgtbl in PostgresCouchContainer) {
        console.log('WATCHDOG: Checking ' + pgtbl);
        if (typeof PostgresCouchContainer[pgtbl] == "undefined") {
            delete PostgresCouchContainer[pgtbl];
            console.log('WATCHDOG: Cleared reaped undefined ' + pgtbl);
        } else if (PostgresCouchContainer[pgtbl].alive() == false) {
            delete PostgresCouchContainer[pgtbl];
            console.log('WATCHDOG: Reaped dead ' + pgtbl);
        } else {
            reaperCheck(pgtbl)
        }
    }
    if(watch_once == false){
	    setTimeout(function() {
        	feedsWatchdog(false);
	    }, feedswatchdog_interval);
    }
}

function pgWatchdog(){
    if(postgres_dead == true){
      //feedsWatchdog(true); ??
      console.log('PG_WATCHDOG: reconnecting');
      connectPostgres();
    }else{
      //test postgres connection
      console.log('PG_WATCHDOG: OK');  //comment out if too much info
    }
    setTimeout(function() {
        pgWatchdog();
    }, 15000);

}


function pgtableCheck(pgtbl) {

    var sql = "SELECT EXISTS (SELECT 1 FROM   pg_catalog.pg_class c JOIN ";
    sql += "pg_catalog.pg_namespace n ON n.oid = c.relnamespace ";
    sql += "WHERE  n.nspname = 'public' AND c.relkind = 'r' ";
    sql += "AND c.relname = '" + pgtbl + "') AS mytest";
    pgclient.query(sql, function(err, result) {
        if (err) {
            console.error(sql, err);
            process.exit();
        } else {
            if (result.rows[0].mytest.toString() == 'false') {
                sql = "CREATE TABLE " + pgtbl + " ";
                sql += "(id text, doc jsonb, CONSTRAINT ";
                sql += pgtbl + "_pkey PRIMARY KEY (id) ) ";

		//also need to set since_checkpoints.since to 0

                pgclient.query(sql, function(err, result) {
                    if (err) {
                        console.error(sql, err);
                        process.exit();
                    } else {
                        console.log(pgtbl + ': pgtable created');
                    }
                });
            }
        }
    });
}

var http = require("http");


function onRequest(request, response) {
    response.writeHead(200, {
        "Content-Type": "text/plain"
    });

    console.log(request.url);
    switch (request.url) {
        case '/_finder':
            response.write("Starting FINDER\n");
	    findFeeds(true);
            break;
        case '/_watchdog':
            response.write("Starting WATCHDOG\n");
	    feedsWatchdog(true);
            break;
        case '/_status':
	    var status = [];
            for (var pgtbl in PostgresCouchContainer) {
                if (typeof PostgresCouchContainer[pgtbl] == "undefined") { //is possble that watchdog has cleared dead object
                        status[pgtbl] = { alive: false, checkpoint: false };
                } else {
                        status.push ( { feed: pgtbl, status: { alive: PostgresCouchContainer[pgtbl].alive(),
                                                               status: PostgresCouchContainer[pgtbl].status(),
                                                               since: PostgresCouchContainer[pgtbl].since().toString(),
                                                               since_checkpoint: PostgresCouchContainer[pgtbl].since_checkpoint().toString()
							//% complete
							//time running
							//pg rec cound, pg table size,
                                                        //couch rec count, couch update seq, couch size?
                                                             }
                                     } );
		}
            }
            response.write(JSON.stringify(status));

            break;
        default:
            response.write("OK\n");
    }
    response.end();
}

http.createServer(onRequest).listen(control_port);
console.log('Listening on port ' + control_port);

connectPostgres(true); //connect and run feedFinder once

setTimeout(function() {
    pgWatchdog();
}, pgwatchdog_interval);

setTimeout(function() {
    findFeeds(false);  //with timeout reinvoke itself
}, findfeeds_interval);

setTimeout(function() {
    feedsWatchdog(false); //with timout to reinvoke itself
}, feedswatchdog_interval);




