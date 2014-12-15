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

: 
      SELECT id, doc->'myvar' AS myvar FROM example 
      WHERE id LIKE 'test%' AND CAST(doc->>'myvar' AS numeric) > 50
      ORDER BY myvar
      
        id   | myvar 
      -------+-------
       test3 | "100"
       test1 | "100"
       test5 | "70"
      (3 rows)


     UPDATE example 
     SET doc=json_object_set_key(
            doc::json, 'myvar'::text, (CAST(doc->>'myvar'::text AS numeric) + 50)::text
         )::jsonb,
         from_pg=true  
     WHERE id LIKE 'test%' AND CAST(doc->>'myvar' AS numeric) < 60
 
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
 
 
