#!/usr/bin/env node

const { Pool, Client } = require('pg')
var PostgresCouchDB = require('../lib');

// old notes from original branch
//Note there is an error in the simple example which i have not tracked down/fixed
//yet it will not restart the stream from where it left off if the feeder is stopped
//
//I am working on the daemon.js in same direcory as this which restarts happily.
//

var settings = 
      {
        couchdb: {
         url: 'http://user:pass@ipAddress:5984',
         pgtable:  'couch_import',
         database: 'tcsmaster'
       }
      };

var pgclient = new Client({
	user: 'user',
  	host: 'ipAddress',
  	database: 'tcs_import',
  	password: 'pass',
  	port: 5432,
});

pgclient
  .connect()
  .then(() => {
        console.log('Connected to postgres');

	initial_since = get_initial_since(settings.couchdb.pgtable);
	createImporter();
  })
  .catch(err => console.error('connection error', err.stack))

function createImporter(){
    settings.since = initial_since;
    var importer = new PostgresCouchDB(pgclient,  settings );
    
      importer.start();

    //enable what event you want to watch
    importer.events.on('connect', console.log);
    importer.events.on('checkpoint', console.log);
    importer.events.on('checkpoint.error', function(msg, err) {
        console.error(msg, err);
	process.exit(1);
    });

    //importer.events.on('change', console.log);  //very noisy
    importer.events.on('change.error', function(feed, change, err) {
	console.error(feed, err.body, err);
    });

    importer.events.on('error', function(msg, err) { console.error(msg, err); });

    //importer.events.on('drain', console.log);

    importer.events.on('stop', function(key) {
    	console.log(key + ': stopped');
    });

}



function get_initial_since(feedname) {
    var sql = '';
                sql = "SELECT since FROM since_checkpoints WHERE pgtable='" + feedname + "' AND enabled=True";
                pgclient.query(sql, function(err, result) {
                    if (err) {
                        console.error(feedname + ": Could not get pgtables and checkpoints with: " + sql, err);
                        process.exit();
                    } else {
                        if (result.rows.length > 0) {
                            console.log(feedname + ': initial since=' + result.rows[0].since);
                            initial_since = result.rows[0].since;
                        } else {
                            sql = "INSERT INTO since_checkpoints ";
                            sql += "(pgtable, since, enabled) VALUES ";
                            sql += "('" + feedname + "', 0, True)";
                            pgclient.query(sql, function(err, result) {
                                if (err) {
                                    console.error(feedname + ': Unable to insert row "' + feedname + '"into table', sql, err);
                                    process.exit();
                                } else {
                                    console.log(feedname + ': Added to since_checkpoint table');
                                    initial_since = 0;
                                }
                            });
                        }
                    }
                });
   
}

