couch-to-postgres  /  pgcouch / couchpg / couchgres / postcouch
=================

Node libary to stream CouchDB changes into PostgreSQL with a simple client example.  Based on https://github.com/orchestrate-io/orchestrate-couchdb.

By adding a few some extra bits allows not only for SELECT queries on the data but also UPDATE/INSERT/DELETE on your couchdb docs within Postgres.  It is also possible to use your couch views as tables.  

Basically it allows postgres to use couchdb as its datastore - sort of like a Foreign Data Wrapper https://wiki.postgresql.org/wiki/Foreign_data_wrappers eg couchdb_fdw - but has a near realtime copy of records in postgres.

For example:

Add a doc to a couch

      curl -X PUT http://192.168.3.21:5984/example/1234567 -d '{"myvar":"foo"}'
      {"ok":true,"id":"1234567","rev":"1-d3747a58baa817834a21ceeaf3084c41"}      


See it in postgres:

     postgresdb=> SELECT id, doc FROM example WHERE id='1234567';

         id    |                                       doc                                        
      ---------+----------------------------------------------------------------------------------
       1234567 | {"_id": "1234567", "_rev": "1-d3747a58baa817834a21ceeaf3084c41", "myvar": "foo"}
      (1 row)



Update a doc using postgres:

      postgresdb=> UPDATE example 
      postgresdb-> SET doc=json_object_set_key(doc::json, 'myvar'::text, 'bar'::text)::jsonb, from_pg=true 
      postgresdb-> WHERE id='1234567';
      DEBUG:  pgsql-http: queried http://192.168.3.21:5984/example/1234567
      CONTEXT:  SQL statement "SELECT headers FROM http_post('http://192.168.3.21:5984/' || TG_TABLE_NAME || '/' || NEW.id::text, '', NEW.doc::text, 'application/json'::text)"
      PL/pgSQL function couchdb_put() line 9 at SQL statement
      UPDATE 0

The couchdb_put function needs some more work. 

See it in couch:

      	curl -X GET http://192.168.3.21:5984/example/1234567 
        {"_id":"1234567","_rev":"2-b9f4c54fc36bdeb78c31590920c9751b","myvar":"bar"}

And in postgres:

      postgresdb=> SELECT id, doc FROM example WHERE id='1234567';
         id    |                                       doc                                        
      ---------+----------------------------------------------------------------------------------
       1234567 | {"_id": "1234567", "_rev": "2-b9f4c54fc36bdeb78c31590920c9751b", "myvar": "bar"}
      (1 row)



Add a doc using postgres 

      postgresdb=> INSERT INTO example (id, doc, from_pg) VALUES ('7654321', json_object('{_id,myvar}','{7654321, 100}')::jsonb, true);
      DEBUG:  pgsql-http: queried http://192.168.3.21:5984/example/7654321
      CONTEXT:  SQL statement "SELECT headers FROM http_post('http://192.168.3.21:5984/' || TG_TABLE_NAME || '/' || NEW.id::text, '', NEW.doc::text, 'application/json'::text)"
      PL/pgSQL function couchdb_put() line 9 at SQL statement
      INSERT 0 0
      

See it in couch

      curl -X GET http://192.168.3.21:5984/example/7654321 
      {"_id":"7654321","_rev":"1-08343cb32bb0903348c0903e574cfbd0","myvar":"100"}


Update doc created postgres with couch 

      curl -X PUT http://192.168.3.21:5984/example/7654321 -d '{"_id":"7654321","_rev":"1-08343cb32bb0903348c0903e574cfbd0","myvar":"50"}'
      {"ok":true,"id":"7654321","rev":"2-5057c4942c6b92f8a9e2c3e5a75fd0b9"


See it in postgres

      SELECT id, doc FROM example WHERE id='1234567';
         id    |                                       doc                                        
      ---------+----------------------------------------------------------------------------------
       1234567 | {"_id": "1234567", "_rev": "2-b9f4c54fc36bdeb78c31590920c9751b", "myvar": "bar"}
      (1 row)


Add some more docs


      INSERT INTO example (id, doc, from_pg) VALUES ('test1', json_object('{_id,myvar}','{test1, 100}')::jsonb, true);
      INSERT INTO example (id, doc, from_pg) VALUES ('test2', json_object('{_id,myvar}','{test2, 50}')::jsonb, true);
  
or

      curl -X PUT http://192.168.3.21:5984/example/test3 -d '{"_id":"test3", "myvar":"100"}'
      curl -X PUT http://192.168.3.21:5984/example/test4 -d '{"_id":"test4", "myvar":"50"}'
      curl -X PUT http://192.168.3.21:5984/example/test5 -d '{"_id":"test5", "myvar":"70"}'
      curl -X PUT http://192.168.3.21:5984/example/test6 -d '{"_id":"test6", "myvar":"20"}'
      curl -X PUT http://192.168.3.21:5984/example/test7 -d '{"_id":"test7", "myvar":"10"}'

Do a query on the docs

      SELECT id, doc->'myvar' AS myvar FROM example 
      WHERE id LIKE 'test%' AND CAST(doc->>'myvar' AS numeric) > 50
      ORDER BY myvar
      
        id   | myvar 
      -------+-------
       test3 | "100"
       test1 | "100"
       test5 | "70"
      (3 rows)


Update some of the docs

     UPDATE example 
     SET doc=json_object_set_key(
            doc::json, 'myvar'::text, (CAST(doc->>'myvar'::text AS numeric) + 50)::text
         )::jsonb,
         from_pg=true  
     WHERE id LIKE 'test%' AND CAST(doc->>'myvar' AS numeric) < 60
 
 Peform same query 
 
    SELECT id, doc->'myvar' AS myvar FROM example 
    WHERE id LIKE 'test%' AND CAST(doc->>'myvar' AS numeric) > 50
    ORDER BY myvar

       id   | myvar 
     -------+-------
      test4 | "100"
      test2 | "100"
      test3 | "100"
      test1 | "100"
      test7 | "60"
      test5 | "70"
      test6 | "70"
     (7 rows)

Initially I didnt spot the above order being wrong so you need to be careful.

      SELECT id, CAST(doc->>'myvar' AS numeric) as myvar FROM example 
      WHERE id LIKE 'test%' AND CAST(doc->>'myvar' AS numeric) > 50
      ORDER BY myvar, doc->>'_id'

       id   | myvar 
     -------+-------
      test7 | "60"
      test5 | "70"
      test6 | "70"
      test1 | "100"
      test2 | "100"
      test3 | "100"
      test4 | "100"
     (7 rows)
     
Order is now correct.


And finally in couch

     curl -s -X POST '192.168.3.21:5984/example/_temp_view?include_docs=false' -H 'Content-Type: application/json' \
     -d '{"map":"function(doc) { emit(doc._id, doc.myvar) };"}'  
     {"total_rows":7,"offset":0,"rows":[
     {"id":"test1","key":"test1","value":"100"},
     {"id":"test2","key":"test2","value":"100"},
     {"id":"test3","key":"test3","value":"100"},
     {"id":"test4","key":"test4","value":"100"},
     {"id":"test5","key":"test5","value":"70"},
     {"id":"test6","key":"test6","value":"70"},
     {"id":"test7","key":"test7","value":"60"}
     ]}
 
It is also possible to use a couchdb view as a table:

The couch design doc:    

    {
      "_id": "_design/mw_views",
      "language": "javascript",
      "views": {
          "by_feedName": {
          "map": "function(doc) { emit(doc.feedName,null); }",
          "reduce": "_count"
        },
        "by_tags": {
          "map": "function(doc) { for(var i in doc.tags) { emit (doc.tags[i],null);  } }",
          "reduce": "_count"
        }
     }
    }
 
 
    WITH by_feedname_reduced AS (
      SELECT * FROM json_to_recordset(
        (
         SELECT  (content::json->>'rows')::json  
         FROM http_get('http://192.168.3.23:5984/articles/_design/mw_views/_view/by_feedName?group=true'))
        ) AS x (key text, value text)
    )

    SELECT * FROM by_feedname_reduced WHERE value::numeric > 6000 ORDER BY key 
 
 This takes under a second to run but the initial build of the view takes about 20 mins for a fresh copy of the couchdb.
 
 The equivilent query using the the data in postgres 
 
    WITH tbl AS (
        SELECT DISTINCT doc->>'feedName' as key, COUNT(doc->>'feedName') AS value 
        FROM articles
        GROUP BY doc->>'feedName'
    )
    SELECT key, value FROM tbl WHERE value > 6000 ORDER BY key;
 
 This takes over 4 seconds.
 
 
 
 
 Testing with my articles database from birdreader - https://github.com/glynnbird/birdreader 
 
    curl -X GET http://localhost:5984/articles
    {"db_name":"articles","doc_count":63759,"doc_del_count":2,"update_seq":92467,"purge_seq":0,"compact_running":false,"disk_size":151752824,"data_size":121586165,"instance_start_time":"1418686121041424","disk_format_version":6,"committed_update_seq":92467}
 
 
    SELECT DISTINCT jsonb_object_keys(doc) AS myfields
    FROM articles ORDER BY myfields

This queries all of the documents and retrieves the couch documents fields.

On another couch database with a 'type' field for different doc types stored in the same database - about 70k docs.

    SELECT DISTINCT doc->>'type' as doctype, count(doc->>'type')
    FROM mytable GROUP BY doctype ORDER BY doctype 

Takes under a second.

    SELECT DISTINCT doc->>'type' as doctype, jsonb_object_keys(doc) AS myfields
    FROM mytable
    ORDER BY doctype , myfields;
    
With no indexes the above query takes just over 10 secs.  I have made no indexes or adjustments to the default FreeBSD postgresql94-server-9.4.r1 port.


----------

Example setup and postgres configuration
    
    git clone git@github.com:sysadminmike/couch-to-postgres.git
    

Get needed modules:

    npm install 


Edit ./bin/index.js to suite your settings:

    var settings =
          {
            couchdb: {
             url: 'http://192.168.3.21:5984',
             pgtable:  'example',
             database: 'example'
           }
          };

     pgclient = new pg.Client("postgres://mike@localhost/pgdatabase");


Before starting it up create the since_checkpoints table

	CREATE TABLE since_checkpoints
	(
	  pgtable text NOT NULL,
	  since numeric DEFAULT 0,
	  enabled boolean DEFAULT false, --not used in the simple client example
	  CONSTRAINT since_checkpoint_pkey PRIMARY KEY (pgtable)
	)

This table is used to store the checkpoint for the database(s) being synced something akin to the couchdb _replicator database.

Create the table to store the couch docs:

    CREATE TABLE example
    (
      id text NOT NULL,
      doc jsonb,
      CONSTRAINT example_pkey PRIMARY KEY (id)
    )

Start watching changes

    ./bin/index.js

It will add a record to the since_checkpoints table and begin syncing.

At this point you can now perform SELECT queries the docs within postgres as in the above example.  This should be fine to use against a production couchdb as it makes no changes to and is performing the same tasks as the elastic search river plugin.  With a bit of copy/pasting it is possible to use sql to create simple scripts or one liners to run in a shell with curl.

Also take a look at /bin/daemon.js and https://github.com/sysadminmike/couch-to-postgres/blob/master/daemon-README.md

-------

To handle UPDATE/INSERT/DELETE more configuration is required.  Note this is still experimental so I wouldnt point this at any production data.

First install the postgres extension pgsql-http  at https://github.com/pramsey/pgsql-http 

See note about pgsql-http module install if you not sure how to install a postgres extension - note this has just been updated to handle PUT and DELETE requests - i have not yet had a chane to test anything i have done on this page with the new version but will try to shortly but think any reference to http_post need updating as the new version specifies:

	http_post(uri VARCHAR, content VARCHAR, content_type VARCHAR)
	
But on this page I am using the old one:

	http_post(url VARCHAR, params VARCHAR, data VARCHAR, contenttype VARCHAR DEFAULT NULL)
	
So please bear this in mind if setting this up.

Then add it in the database you want to use:

    CREATE EXTENSION http


If you havent already done it:

    CREATE TABLE since_checkpoints   
    (
      pgtable text NOT NULL,
      since numeric DEFAULT 0,
      enabled boolean DEFAULT false,
      CONSTRAINT since_checkpoint_pkey PRIMARY KEY (pgtable)
    );


Add function to put data into couchdb:

    CREATE OR REPLACE FUNCTION couchdb_put() RETURNS trigger AS $BODY$
    DECLARE
        RES RECORD;
    BEGIN
     IF (NEW.from_pg) IS NULL THEN
       RETURN NEW;
     ELSE 
       
       SELECT status FROM http_post('http://192.168.3.21:5984/' || TG_TABLE_NAME || '/' || NEW.id::text, '', NEW.doc::text, 'application/json'::text) INTO RES;    

       --Need to check RES for response code
       --RAISE EXCEPTION 'Result: %', RES;
       RETURN null;
     END IF;
    END;
    $BODY$
    LANGUAGE plpgsql VOLATILE  

Add function to modify fields inside the PostgreSQL JSON datatype - from: http://stackoverflow.com/questions/18209625/how-do-i-modify-fields-inside-the-new-postgresql-json-datatype


    CREATE OR REPLACE FUNCTION json_object_set_key(json json, key_to_set text, value_to_set anyelement)
      RETURNS json AS
    $BODY$
    SELECT COALESCE(
      (SELECT ('{' || string_agg(to_json("key") || ':' || "value", ',') || '}')
         FROM (SELECT *
                 FROM json_each("json")
                WHERE "key" <> "key_to_set"
                UNION ALL
               SELECT "key_to_set", to_json("value_to_set")) AS "fields"),
      '{}'
    )::json
    $BODY$
      LANGUAGE sql IMMUTABLE STRICT;
      
      

Create table to hold the docs

    CREATE TABLE example
    (
      id text NOT NULL,
      doc jsonb,
      from_pg boolean, -- for trigger nothing stored here
      CONSTRAINT example_pkey PRIMARY KEY (id)
    );


Create trigger to stop data being inserted into the table from sql and send off to couch instead

    CREATE TRIGGER add_doc_to_couch 
    BEFORE INSERT OR UPDATE 
    ON example FOR EACH ROW EXECUTE PROCEDURE couchdb_put();


Note: All queries in postgres must have "from_pg=true" for inserts and updates or the postgres will send the data to the table and not send it to couch.  

I plan to reverse this logic and make the libary include this so it will be possible to issue inserts/updates and exclude this field.

You can now start the node client and give it a test.

-----

A few variable to tune in ./lib/index.js need to move to config options

In checkpoint_changes function:

    ckwait = 3 * 1000;  

This is how often the stream is checkpointed when the stream is active. I would adjust this depending on how busy you couchdb is.  When the stream is idle this increases to 10 secs.  

In startFollowing function there is:
     // The inactivity timer is for time between *changes*, or time between the
     // initial connection and the first change. Therefore it goes here.
     stream.inactivity_ms = 30000;

Maybe use NOTIFY and have node client LISTEN for a message when postgres calls couchdb_put() for the first time (can you do a timer in postgres?? or node will get notified about every update and only needs a wake up after idle time).

-----


Performance wise compared to the php dumping script

On a test with a couchdb of about 150Mb with 65k docs the node libary complete working through _changes in about 17 minutes to add all the docs to an empty table and then keeps it in sync.

The couch-to-postgres-php-dumper script - https://github.com/sysadminmike/couch-to-postgres-php-dump takes about 28 minutes for the initial sync and 11 secs for a resync.

Replicating the same db from one jail running couch to another couch jail on the same machine as a baseline takes just over 8 minutes:

    {"session_id":"661411f2137c64efc940f55b802dc35b","start_time":"Tue, 16 Dec 2014 17:00:05 GMT","end_time":"Tue, 16 Dec 2014 17:08:10 GMT","start_last_seq":0,"end_last_seq":92862,"recorded_seq":92862,"missing_checked":63840,"missing_found":63840,"docs_read":63840,"docs_written":63840,"doc_write_failures":0}
    
Looking at top I think postgres is waiting on the disk most of the time rather than the process being cpu bound - the single php process calling curl for each doc was hitting the cpu hard and couldnt be used as a solution for huge databases or have the ability to deal with more than one db at once.

On further testing with some dogey postgres conf settings:

    fsync = off
    synchronous_commit = off
    
As postgres is not the primary datastore its ok if the data dies considering a full rebuild now is under 2 mins:

	mike:~/postgres-couch/couch-to-postgres-test % time ./bin/index.js
	articlespg: {"db_name":"articlespg","doc_count":63838,"doc_del_count":2,"update_seq":63840,"purge_seq":0,"compact_running":false,"disk_size":242487416,"data_size":205414817,"instance_start_time":"1418749205916149","disk_format_version":6,"committed_update_seq":63840}
	Connected to postgres
	articlespg: initial since=0
	articlespg: Starting checkpointer
	articlespg: Checkpoint set to 7180 next check in 3 seconds
	articlespg: Checkpoint set to 9344 next check in 3 seconds
	articlespg: Checkpoint set to 11536 next check in 3 seconds
	...
	articlespg: Checkpoint set to 60920 next check in 3 seconds
	articlespg: Checkpoint set to 63636 next check in 3 seconds
	articlespg: Checkpoint set to 63840 next check in 3 seconds
	articlespg: Checkpoint 63840 is current next check in: 10 seconds
	^C45.919u 3.226s 1:42.10 48.1%  10864+321k 158+0io 0pf+0w
	mike:~/postgres-couch/couch-to-postgres-test % 

So down to well under 2 minutes now todo the initial sync of the same test db - so 4 times faster than a native couch to couch sync.  I think this is faster than Elastic search river doing a similar task.

Snippet from top while it was syncing:

	  PID USERNAME    THR PRI NICE   SIZE    RES STATE   C   TIME    WCPU COMMAND
	57635 mike          6  45    0   621M 66064K uwait   1   0:25  50.78% node
	57636     70        1  36    0   186M 97816K sbwait  1   0:11  22.75% postgres
	44831    919       11  24    0   181M 30048K uwait   0  67:28  20.51% beam.smp
	23891    919       11  20    0   232M 69168K uwait   0  26:22   0.39% beam.smp
	57624     70        1  20    0   180M 17840K select  0   0:00   0.29% postgres
	57622     70        1  21    0   180M 65556K select  1   0:00   0.20% postgres


-----

Possible ways to deploy - master-master postgres setup using couchdbs primary data store and setting up replication between all locations using Postgres and Couch as a pair.

     Location 1                              Location 2
     Postgres == CouchDB ---------- CouchDB == Postgres
                         \        /
                          \      /
                           \    /
                            \  /
                             \/    
                         Location 3
                          CouchDB
                            ||
                          Postgres  
                               
     Where === is the node client keeping the paired postgres up to date
     And ----- is couchdb performing replication 

-----

IDEAS/TODOS - Comments most welcome.

How to do bulk updates:

    WITH new_docs AS (
      SELECT json_object_set_key(doc::json, 'test'::text, 'Couch & Postgres are scool'::text)::jsonb AS docs
      FROM articlespg
    ),
    agg_docs AS (
      SELECT json_agg(docs) AS aggjson FROM new_docs
    )

    SELECT headers FROM 
      http_post('http://192.168.3.21:5984/articlespg/_bulk_docs', '',
      '{"all_or_nothing":true, "docs":' || (SELECT * FROM agg_docs) || '}',
      'application/json'::text) ;    

I tried on the articles test db i am using and it was very fast for an update to < 100 rows
I then tried to update all docs and crashed couch

    DEBUG:  pgsql-http: queried http://192.168.3.21:5984/articlespg/_bulk_docs
    ERROR:  Failed to connect to 192.168.3.21 port 5984: Connection refused
    couchplay=> 
    
However if we split up the request in to smaller chunks:

    WITH newdocs AS ( -- Make chage to json here 
      SELECT id, json_object_set_key(doc::json, 'test'::text, 'Couch & Postgres are scool'::text)::jsonb AS docs
      FROM articlespg 
    ),
    chunked AS (  -- get in chunks 
	SELECT docs, ((ROW_NUMBER() OVER (ORDER BY id) - 1)  / 50) +1 AS chunk_no  
	FROM newdocs
    ),
    chunked_newdocs AS (  -- Bulk up bulk_docs chunks to send 
        SELECT json_agg(docs) AS bulk_docs, chunk_no FROM chunked GROUP BY chunk_no  ORDER BY chunk_no
    )

    SELECT chunk_no, status FROM chunked_newdocs,
           http_post('http://192.168.3.21:5984/articlespg/_bulk_docs', '',
           '{"all_or_nothing":true, "docs":' || (bulk_docs) || '}',
           'application/json'::text); 
  
Chunk size - in this case 50 - i think safe to go to about 500 or 1000 depending on doc size - I tried 1000 to begin with but http_post timed out - and 500 seems to be fine.

Watching the node daemon while running chunked bulk updates i can see the changes streaming back to postgres almost as soon as the start so i think better using an UPDATE as postgres doesnt lock the table while this is happening ***Note need to retest this.

However I think better to change all PUTS to bulks POSTS - need a function like:

     post_docs(docs,chunk_size) - returning recordset of status codes? or just true/false?

how to deal with the case where there are 5 chunks and the first 2 sucseed but the 3rd fails?
is it possible to rollback a transaction in postgres and give the function oldocs and newdocs 
then a post_docs chunk fails it can rollback the chunks which have succeeded?

to be used after like:

     SELECT post_docs(json_object_set_key(doc::json, 'test'::text, 'Couch & Postgres are scool'::text)::jsonb,100)
            AS results
     FROM articlespg



This also makes it very simple to make new databases - just add a new db in couch and change the url to point to it:

    chunked AS (
   	  SELECT docs, ((ROW_NUMBER() OVER (ORDER BY id) - 1)  / 500) +1 AS chunk_no  
  	  FROM articlespg
    ),
    chunked_newdocs AS (
       SELECT json_agg(docs) AS bulk_docs, chunk_no FROM chunked GROUP BY chunk_no  ORDER BY chunk_no
    )
    SELECT chunk_no, status FROM chunked_newdocs,
           http_post('http://192.168.3.21:5984/NEW_articlespg_COPY/_bulk_docs', '',
           '{"all_or_nothing":true, "docs":' || (bulk_docs) || '}', 'application/json'::text);  

I think maybe faster than a replication.


------


Note: On pgsql-http module install:

https://wiki.postgresql.org/wiki/Building_and_Installing_PostgreSQL_Extension_Modules

For FreeBSD you need to have curl and gettext-tools installed.

    # gmake PG_CONFIG=/usr/local/bin/pg_config
    cc -O2 -pipe  -fstack-protector -fno-strict-aliasing -Wall -Wmissing-prototypes -Wpointer-arith -Wdeclaration-after-statement -Wendif-labels -Wmissing-format-attribute -Wformat-security -fno-strict-aliasing -fwrapv -fPIC -DPIC -I. -I./ -I/usr/local/include/postgresql/server -I/usr/local/include/postgresql/internal -I/usr/local/include/libxml2 -I/usr/include -I/usr/local/include -I/usr/local/include  -c -o http.o http.c
    http.c:89:1: warning: unused function 'header_value' [-Wunused-function]
    header_value(const char* header_str, const char* header_name)
    ^
    1 warning generated.
    cc -O2 -pipe  -fstack-protector -fno-strict-aliasing -Wall -Wmissing-prototypes -Wpointer-arith -Wdeclaration-after-statement -Wendif-labels -Wmissing-format-attribute -Wformat-security -fno-strict-aliasing -fwrapv -fPIC -DPIC -I. -I./ -I/usr/local/include/postgresql/server -I/usr/local/include/postgresql/internal -I/usr/local/include/libxml2 -I/usr/include -I/usr/local/include -I/usr/local/include  -c -o stringbuffer.o stringbuffer.c
    cc -O2 -pipe  -fstack-protector -fno-strict-aliasing -Wall -Wmissing-prototypes -Wpointer-arith -Wdeclaration-after-statement -Wendif-labels -Wmissing-format-attribute -Wformat-security -fno-strict-aliasing -fwrapv -fPIC -DPIC -shared -o http.so http.o stringbuffer.o -L/usr/local/lib -L/usr/local/lib -pthread -Wl,-rpath,/usr/lib:/usr/local/lib -fstack-protector -L/usr/local/lib -L/usr/lib  -L/usr/local/lib -Wl,--as-needed -Wl,-R'/usr/local/lib'  -L/usr/local/lib -lcurl



    # gmake PG_CONFIG=/usr/local/bin/pg_config install
    /bin/mkdir -p '/usr/local/lib/postgresql'
    /bin/mkdir -p '/usr/local/share/postgresql/extension'
    /bin/mkdir -p '/usr/local/share/postgresql/extension'
    /usr/bin/install -c -o root -g wheel -m 755  http.so '/usr/local/lib/postgresql/http.so'
    /usr/bin/install -c -o root -g wheel -m 644 http.control '/usr/local/share/postgresql/extension/'
    /usr/bin/install -c -o root -g wheel -m 644 http--1.0.sql '/usr/local/share/postgresql/extension/'



-------------------

Futher thoughts and ideas/questions or want to help?  https://github.com/sysadminmike/couch-to-postgres/issues

More testing:

Update to all records in test articles db - 

	SELECT id , doc->>'read' FROM articlespg WHERE doc->>'read'='false'

	couchplay=> SELECT id , doc->>'read' FROM articlespg WHERE doc->>'read'='false'
	couchplay-> 
	couchplay-> ;
		id        | ?column? 
	------------------+----------
	 _design/mw_views | false
	(1 row)


Returns just the design doc.


On running:

      UPDATE articlespg 
      SET doc = json_object_set_key(doc::json, 'read'::text, true)::jsonb, from_pg=true ;

Something interesting happens with the feed and postgres - I think postgres locks the table while the update takes place as the feeder carries on querying couch but does not update postgres until the update is complete.

While the query is runing you can see the commit sequence in couch updating:

	articlespg: {"db_name":"articlespg","doc_count":63838,"doc_del_count":2,"update_seq":233296,"purge_seq":0,"compact_running":false,"disk_size":2145373958,"data_size":214959726,"instance_start_time":"1418762851354294","disk_format_version":6,"committed_update_seq":233224}
	articlespg: Checkpoint 192414 is current next check in: 10 seconds
	PG_WATCHDOG: OK

	articlespg: {"db_name":"articlespg","doc_count":63838,"doc_del_count":2,"update_seq":242301,"purge_seq":0,"compact_running":false,"disk_size":2234531964,"data_size":215440194,"instance_start_time":"1418762851354294","disk_format_version":6,"committed_update_seq":242301}
	articlespg: Checkpoint 192414 is current next check in: 10 seconds
	PG_WATCHDOG: OK

As soon as I get a return for the query the feed goes mad so think postgres has locked the table while the update runs. *** I need to restest this as i may have been doing this test after i introduced a bug stalling the feed on updates.


The UPDATE takes 475 seconds to return
The river then takes about 3 minutes to catch up after the return
So about 10 minutes to do an update on all 60k records.

I need to look at the bulk updates as i do now think it is possible to do all or nothing update and possible do in a transaction - i think if 2 updates to couch were issued and the second failed then the first would have still taken place as far as couch is concerned.  
At the moment if a single PUT were to fail postgres assume no data has been updated but all of the docs up to then would have been updated - in a bulk this would not be a problem i think.  Note so far not one insert or update has failed but i havent killed couch 1/2 way through.




This did give me an idea for another use for this.  Populate a new couchdb from a subset of the couchdb tables in postgres by simply updating the put_function to temporarly submit updates to a different ip or db eg:

    --SELECT headers FROM http_post('http://192.168.3.21:5984/' || TG_TABLE_NAME || '/' || NEW.id::text, '', NEW.doc::text, 'application/json'::text) INTO RES;    
      SELECT headers FROM http_post('http://192.168.3.21:5984/articlespg-subset' || '/' || NEW.id::text, '', NEW.doc::text, 'application/json'::text) INTO RES;    

Then re-run the update but with a WHERE

    UPDATE articlespg 
    SET doc = json_object_set_key(doc::json, 'read'::text, true)::jsonb, from_pg=true 
    WHERE doc ->>'feedName' ='::Planet PostgreSQL::';

About 10 secs later a populated couchdb with just 761 docs matching the WHERE:

    {"db_name":"articlespg-subset","doc_count":761,"doc_del_count":0,"update_seq":761,"purge_seq":0,"compact_running":false,"disk_size":6107249,"data_size":3380130,"instance_start_time":"1418770153501066","disk_format_version":6,"committed_update_seq":761}

A lot simpler that creating a design doc for a one of filtered replication.
There is no reason why you couldnt do a union on two couch db tables in posgres and merge them into a new couchdb provided there are no id issues.

I have also done a quick test with excel and ms query & access and a passthrough sql query both via odbc to postgres - i can see the couch data in both - this makes ad hoc reports so simple.

Note on name - I think I like postcouch best - and i think most of the work will be done by http_post function POSTing (from postgres) to couchdb

(I think a good idea to also also give option to do PUTS) 
