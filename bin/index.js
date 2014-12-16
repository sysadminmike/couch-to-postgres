#!/usr/bin/env node

var pg = require('pg');
var PostgresCouchDB = require('../lib');



//Note there is an error in the simple example which i have not tracked down/fixed
//yet it will not restart the stream from where it left off if the feeder is stopped
//
//I am working on the daemon.js in same direcory as this which restarts happily.
//

var settings = 
      {
        couchdb: {
         url: 'http://192.168.3.21:5984',
         pgtable:  'example',
         database: 'example'
       }
      };

pgclient = new pg.Client("postgres://mike@localhost/pgdatabase");


pgclient.connect(function(err) {
            if (err) {
                if(err.code == 'ECONNREFUSED'){ //try to catch here but i dont think works
                        console.error('ERROR: Connection to postgres refused', err);
                }else{
                        console.error('ERROR: Could not connect to postgres', err);
                }
                process.exit();
            } else {
                console.log('Connected to postgres');
            }
        }) ;

	
initial_since = get_initial_since(settings.couchdb.pgtable);

createImporter();


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

