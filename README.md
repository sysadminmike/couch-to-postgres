couch-to-postgres
=================

Node libary to stream CouchDB changes into PostgreSQL with a simple client example. 

By adding a few some extra bits allows not only for SELECT queries on the data but also UPDATE/INSERTS/(DELETES todo) on your couchdb docs within Postgres.

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
	  enabled boolean DEFAULT false, --not used is simple client example
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

At this point you can now perform SELECT queries the docs within postgres as in the above example.


-------

To handle UPDATE/INSERT/(DELETE todo) more configuration is required.

First install the postgres extension pgsql-http  at https://github.com/pramsey/pgsql-http 

Before compling a small change need to be made to issue a PUT request instead of POST.
In http.c line 377:

    //CURL_SETOPT(http_handle, CURLOPT_POST, 1);  //Comment this out 
    CURL_SETOPT(http_handle, CURLOPT_CUSTOMREQUEST, "PUT");  //Add this 

See note about pgsql-http module install if you not sure how to install a postgres extension.

Then add it in the database you want to use:

    CREATE EXTENSION http


If you havent already done it:

    CREATE TABLE since_checkpoints   
    (
      pgtable text NOT NULL,
      since numeric DEFAULT 0,
      enabled boolean DEFAULT false,
      CONSTRAINT since_checkpoint_pkey PRIMARY KEY (pgtable)
    )


Add function to put data into couchdb:

    CREATE OR REPLACE FUNCTION couchdb_put() RETURNS trigger AS $BODY$
    DECLARE
        RES RECORD;
    BEGIN
     IF (NEW.from_pg) IS NULL THEN
       RETURN NEW;
     ELSE 
       
       SELECT headers FROM http_post('http://192.168.3.21:5984/' || TG_TABLE_NAME || '/' || NEW.id::text, '', NEW.doc::text, 'application/json'::text) INTO RES;    

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
      CONSTRAINT example_pkey PRIMARY KEY (id);
    )


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

-----


Performance wise compared to the php dumping script

On a test with a couchdb of about 150Mb with 65k docs the node libary complete working through _changes in about 17 minutes to add all the docs to an empty table and then keeps it in sync.

The couch-to-postgres-php-dumper script - https://github.com/sysadminmike/couch-to-postgres-php-dump takes about 28 minutes for the initial sync and 11 secs for a resync.

-----

Possible ways to deploy - master-master postgres setup using couchdb main data and setting up replication between all locations using Postgres and Couch as a pair.

     Location 1                              Location 2
     Postgres == CouchDB --------------------CouchDB == Postgres
                                  |
                                  |
                              Location 3
                               CouchDB
                                  ||
                                Postgres  
                               
     Where == is the node client performing updates
     And ---- is couchdb performing replication 

-----

TODOs 

Deal with DELETE 

Change logic of from_pg and replace with from_feed, alter lib/index.js and add to all updates/inserts/deletes, update postgres function/trigger as well.

I am working on a more complex daemon to deal with multiple couchdbs + API to allow adding removing of steams and recovering from postgres or couchdb restarting/loosing connection so may need to make a few changes to the libary. 

-----

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

