Setup Postgresql database and CouchDb settings in
config/daemon.js

You can use example file:
```
cp config/daemon.js.example config/daemon.js
```

* password can be optional. For example:
```
function DaemonSettings() {
  var credentials = {
    postgres: {
      database: "couchplay",
      username: "mike",
      host: "localhost"
    },
    couchdb: {
      url: 'http://127.0.0.1:5984'
    }
  };

  return credentials;
};

module.exports = DaemonSettings;
```

You will need 3 terminal open for: DAEMON, PGSQL, CURL

Start up daemon

		% ./bin/daemon.js
		DAEMON terminal: Listening on port 8888
		DAEMON terminal: Connected to postgres
		DAEMON terminal: FINDER: One off find started.
		DAEMON terminal: FINDER: 0 dbs to check found
		DAEMON terminal: PG_WATCHDOG: OK


See what happening (TODO: change to /_feeds_status - add /_status about the daemon itself)

		CURL terminal:  $ curl 127.0.0.1:8888/_status
 	        CURL terminal:  []


Add new db to follow

		PGSQL terminal: INSERT INTO since_checkpoints (pgtable, since, enabled) VALUES ('articlespg',0,true);


Wake up the finder - note: this will run periodically so you can just wait a few mins at this point

		CURL terminal:  $ curl 127.0.0.1:8888/_finder


The daemon should now see the new feed to follow

		DAEMON terminal: /_finder
		DAEMON terminal: FINDER: One off find started.
		DAEMON terminal: FINDER: 1 dbs to check found
		DAEMON terminal: FINDER: Found articlespg processing changes since: 0
		DAEMON terminal: articlespg: {"db_name":"articlespg","doc_count":63338,"doc_del_count":0,"update_seq":63338,"purge_seq":0,"compact_running":false,"disk_size":206778481,"data_size":206048077,"instance_start_time":"1418803415250170","disk_format_version":6,"committed_update_seq":63338}
		DAEMON terminal: articlespg: Starting checkpointer
		DAEMON terminal: articlespg: Checkpoint 938 is current next check in: 10 seconds
		DAEMON terminal: PG_WATCHDOG: OK
		DAEMON terminal: WATCHDOG: Started
		DAEMON terminal: WATCHDOG: Checking articlespg
		DAEMON terminal: PG_WATCHDOG: OK
		DAEMON terminal: FINDER: Started
		DAEMON terminal: WATCHDOG: articlespg ok
		DAEMON terminal: articlespg: Checkpoint set to 4510 next check in 3 seconds
		DAEMON terminal: FINDER: 1 dbs to check found
		DAEMON terminal: articlespg: Checkpoint set to 8194 next check in 3 seconds
		DAEMON terminal: articlespg: Checkpoint set to 12084 next check in 3 seconds
		DAEMON terminal: articlespg: Checkpoint set to 16020 next check in 3 seconds
		DAEMON terminal: PG_WATCHDOG: OK
		DAEMON terminal: /_status
		DAEMON terminal: articlespg: Checkpoint set to 19680 next check in 3 seconds
		DAEMON terminal: articlespg: Checkpoint set to 23608 next check in 3 seconds
		DAEMON terminal: articlespg: Checkpoint set to 27310 next check in 3 seconds
		DAEMON terminal: PG_WATCHDOG: OK
		DAEMON terminal: articlespg: Checkpoint set to 31152 next check in 3 seconds
		DAEMON terminal: articlespg: Checkpoint set to 34923 next check in 3 seconds
		DAEMON terminal: articlespg: Checkpoint set to 38783 next check in 3 seconds
		DAEMON terminal: PG_WATCHDOG: OK
		DAEMON terminal: articlespg: Checkpoint set to 42680 next check in 3 seconds
		DAEMON terminal: /_status
		DAEMON terminal: articlespg: Checkpoint set to 46601 next check in 3 seconds
		DAEMON terminal: articlespg: Checkpoint set to 50549 next check in 3 seconds
		DAEMON terminal: articlespg: Checkpoint set to 54489 next check in 3 seconds
		DAEMON terminal: PG_WATCHDOG: OK
		DAEMON terminal: articlespg: Checkpoint set to 58512 next check in 3 seconds
		DAEMON terminal: articlespg: Checkpoint set to 62484 next check in 3 seconds
		DAEMON terminal: articlespg: Checkpoint set to 63338 next check in 3 seconds
		DAEMON terminal: WATCHDOG: Started
		DAEMON terminal: WATCHDOG: Checking articlespg
		DAEMON terminal: PG_WATCHDOG: OK
		DAEMON terminal: WATCHDOG: articlespg ok
		DAEMON terminal: articlespg: Checkpoint 63338 is current next check in: 10 seconds



While the daemon was proccessing through the change log in the CURL terminal:

		CURL terminal: $ curl 127.0.0.1:8888/_status
		CURL terminal: [{"feed":"articlespg","status":{"alive":true,"status":"Following","since":"17832","since_checkpoint":"16019"}}]
		CURL terminal: $ curl 127.0.0.1:8888/_status
		CURL terminal: [{"feed":"articlespg","status":{"alive":true,"status":"Following","since":"43822","since_checkpoint":"42679"}}]$
		CURL terminal: $ curl 127.0.0.1:8888/_status
		CURL terminal: [{"feed":"articlespg","status":{"alive":true,"status":"Following","since":"63338","since_checkpoint":"63338"}}]$
		CURL terminal: $ curl 127.0.0.1:8888/_status
		CURL terminal: [{"feed":"articlespg","status":{"alive":true,"status":"Following","since":"63338","since_checkpoint":"63338"}}]


If we dont want this feed anymore we can disable or delete it from the since_checkpoints table

		PGSQL terminal: UPDATE since_checkpoints SET enabled=false WHERE pgtable='articlespg';


We can either wait for the watchdog or force it to run

		CURL terminal: $ curl 127.0.0.1:8888/_watchdog
		CURL terminal: Starting WATCHDOG



		DAEMON terminal: /_watchdog
		DAEMON terminal: WATCHDOG: One off watch started.
		DAEMON terminal: WATCHDOG: Checking articlespg
		DAEMON terminal: articlespg: stopping stream
		DAEMON terminal: articlespg: stopped
		DAEMON terminal: WATCHDOG: articlespg feed stopped


Lets check what the status is

		CURL terminal: $ curl 127.0.0.1:8888/_status
		CURL terminal: [{"feed":"articlespg","status":{"alive":false,"status":"stopped","since":"63338","since_checkpoint":"63338"}}]$


Once a stream has been stopped by the watchdog it will then be reaped the next time the watchdog runs again we can force it to run or wait

		CURL terminal: $ curl 127.0.0.1:8888/_watchdog
		CURL terminal: Starting WATCHDOG

Second pass its now gone

		DAEMON terminal: /_watchdog
		DAEMON terminal: WATCHDOG: One off watch started.
		DAEMON terminal: WATCHDOG: Checking articlespg
		DAEMON terminal: WATCHDOG: Reaped dead articlespg

To be sure:

		CURL terminal: $ curl 127.0.0.1:8888/_status
		CURL terminal: []


We can now enable it again

		PGSQL terminal: UPDATE since_checkpoints SET enabled=true WHERE pgtable='articlespg';



And start the finder

		CURL terminal: curl 127.0.0.1:8888/_finder
		CURL terminal: Starting FINDER


It will now start the feed again

		DAEMON terminal: /_finder
		DAEMON terminal: FINDER: One off find started.
		DAEMON terminal: FINDER: 1 dbs to check found
		DAEMON terminal: FINDER: Found articlespg processing changes since: 63338
		DAEMON terminal: articlespg: {"db_name":"articlespg","doc_count":63338,"doc_del_count":0,"update_seq":63338,"purge_seq":0,"compact_running":false,"disk_size":206778481,"data_size":206048077,"instance_start_time":"1418803415250170","disk_format_version":6,"committed_update_seq":63338}
		DAEMON terminal: articlespg: Starting checkpointer
		DAEMON terminal: articlespg: Checkpoint 63338 is current next check in: 10 seconds

		CURL terminal: $ curl 127.0.0.1:8888/_status
		CURL terminal: [{"feed":"articlespg","status":{"alive":true,"status":"Following","since":"63338","since_checkpoint":"63338"}}]


-----------------------------------

What if postgres dies (unlikley) or something else upsets it.

Stop postgres


		PG_WATCHDOG: OK
		articlespg: Checkpoint 63338 is current next check in: 10 seconds
		PG_WATCHDOG: OK
		articlespg: Checkpoint 63338 is current next check in: 10 seconds
		PG_WATCHDOG: OK
		articlespg: {"db_name":"articlespg","doc_count":63338,"doc_del_count":0,"update_seq":63338,"purge_seq":0,"compact_running":false,"disk_size":206778481,"data_size":206048077,"instance_start_time":"1418803415250170","disk_format_version":6,"committed_update_seq":63338}
		Postgresl connection died - Node NOT Exiting... { [error: terminating connection due to administrator command]
		  name: 'error',
		  length: 109,
		  severity: 'FATAL',
		  code: '57P01',
		  detail: undefined,
		  hint: undefined,
		  position: undefined,
		  internalPosition: undefined,
		  internalQuery: undefined,
		  where: undefined,
		  file: 'postgres.c',
		  line: '2873',
		  routine: 'ProcessInterrupts' }
		WATCHDOG: One off watch started.
		WATCHDOG: Checking articlespg
		articlespg: stopping stream
		articlespg: stopped
		WATCHDOG: articlespg postgres dead feed stopped
		PG_WATCHDOG: reconnecting
		ERROR: Connection to postgres refused { [Error: connect ECONNREFUSED]
		  code: 'ECONNREFUSED',
		  errno: 'ECONNREFUSED',
		  syscall: 'connect' }
		WATCHDOG: Started
		WATCHDOG: Checking articlespg
		WATCHDOG: Reaped dead articlespg
		PG_WATCHDOG: reconnecting
		ERROR: Connection to postgres refused { [Error: connect ECONNREFUSED]
		  code: 'ECONNREFUSED',
		  errno: 'ECONNREFUSED',
		  syscall: 'connect' }
		FINDER: postgres is dead


The daemon will terminate all feeds and try to reconnect to postgres, once reconnected it will bring the feeds back up.


		PG_WATCHDOG: reconnecting
		Connected to postgres
		PG_WATCHDOG: OK
		PG_WATCHDOG: OK
		PG_WATCHDOG: OK
		WATCHDOG: Started
		FINDER: Started
		FINDER: 1 dbs to check found
		FINDER: Found articlespg processing changes since: 63338
		articlespg: {"db_name":"articlespg","doc_count":63338,"doc_del_count":0,"update_seq":63338,"purge_seq":0,"compact_running":false,"disk_size":206778481,"data_size":206048077,"instance_start_time":"1418803415250170","disk_format_version":6,"committed_update_seq":63338}
		articlespg: Starting checkpointer
		articlespg: Checkpoint 63338 is current next check in: 10 seconds
		articlespg: Checkpoint 63338 is current next check in: 10 seconds


------------------

What happens if couchdb dies?

		PG_WATCHDOG: OK
		articlespg: Checkpoint 63337 is current next check in: 10 seconds
		WATCHDOG: Started
		WATCHDOG: Checking articlespg
		WATCHDOG: articlespg ok
		PG_WATCHDOG: OK
		articlespg: Checkpoint 63337 is current next check in: 10 seconds
		articlespg: Error connection refused. Sleeping for: 37 seconds { [Error: connect ECONNREFUSED]
		  code: 'ECONNREFUSED',
		  errno: 'ECONNREFUSED',
		  syscall: 'connect' }
		FINDER: Started
		FINDER: 1 dbs to check found
		PG_WATCHDOG: OK
		articlespg: Checkpoint 63337 is current next check in: 10 seconds
		PG_WATCHDOG: OK
		articlespg: Checkpoint 63337 is current next check in: 10 seconds
		PG_WATCHDOG: OK
		articlespg: Checkpoint 63337 is current next check in: 10 seconds
		PG_WATCHDOG: OK
		articlespg: Checkpoint 63337 is current next check in: 10 seconds
		articlespg: Error connection refused. Sleeping for: 46 seconds { [Error: connect ECONNREFUSED]
		  code: 'ECONNREFUSED',
		  errno: 'ECONNREFUSED',
		  syscall: 'connect' }
		WATCHDOG: Started
		WATCHDOG: Checking articlespg
		WATCHDOG: articlespg ok
		PG_WATCHDOG: OK
		articlespg: Checkpoint 63337 is current next check in: 10 seconds
		PG_WATCHDOG: OK
		articlespg: Checkpoint 63337 is current next check in: 10 seconds
		FINDER: Started
		FINDER: 1 dbs to check found
		PG_WATCHDOG: OK


In the curl console when couch was dead:

		$ curl 127.0.0.1:8888/_status
		[{"feed":"articlespg","status":{"alive":true,"status":"Error: Not connected to couch server trying to reconnect.","since":"63337","since_checkpoint":"63337"}}]

And when couch came back:

		$ curl 127.0.0.1:8888/_status
		[{"feed":"articlespg","status":{"alive":true,"status":"Following","since":"63338","since_checkpoint":"63337"}}]$




