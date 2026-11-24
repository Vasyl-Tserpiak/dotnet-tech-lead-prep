// Independent interview walkthroughs keyed by the tracker's stable topic IDs.
window.ASTRA_EXPLANATIONS = {
  "caching-strategies__cache-aside-lazy-loading-read-on-miss-load-populate": {
    overview: "A product page needs the price of product 42. On a cache hit the application returns it immediately. On a miss it reads the price table and stores the result with an expiry. Only products people request occupy cache space.",
    question: "Why can deleting a key after commit still serve the old price?",
    walkthrough: "Follow two requests through the miss path. Reader A obtains price 10 from SQL and pauses before filling Redis. Writer B commits price 12 and deletes the key. A resumes and stores 10 with a fresh TTL. Deleting after commit avoids invalidating before a rollback, but cannot coordinate those separate systems. If the page tolerates a short stale interval, keep the design simple. For a binding quote, check the authoritative price or version when accepting the order.",
    example: "A: GET price → miss → SQL returns (10, v7)\nB: SQL commits (12, v8) → DEL price\nA: SET price (10, v7) with TTL → next cache hit returns 10",
    implications: "After changing a price, invalidate its entry after the database commits. A reader already in flight can still repopulate an old price. Decide how much staleness the display can tolerate and validate the price again at checkout."
  },
  "caching-strategies__read-through-the-cache-loads-from-db-on-a-miss": {
    overview: "Imagine the application calling a single product lookup method. Its cache provider owns a loader that fetches missing products and populates the cache before returning them. Every caller gets the same miss behavior.",
    question: "Who owns a miss, and how do you test the contract?",
    walkthrough: "The cache layer takes a key and a loader. It checks for a stored value, calls the loader on a miss, stores a successful result under the same key, then returns it. To the caller a hit and a successful load have the same shape. Distinguish an absent database row from a loader timeout. Caching both as “missing” can turn a five-second database outage into minutes of false product removals.",
    example: "Test with a counting loader: first read of 42 → one load. Second read before expiry → still one load. After expiry → two loads. Separately test concurrent misses against the provider’s documented behavior.",
    implications: "The loader needs a timeout and a policy for absent products. Check whether the provider coalesces simultaneous misses. Moving the loader behind an abstraction alone does nothing to reduce a hundred concurrent database reads."
  },
  "caching-strategies__write-through-write-cache-db-synchronously": {
    overview: "A preferences service acknowledges a change once the backing store and the cache have both accepted the new value. That extra write on the request path buys a warm cache for subsequent reads.",
    question: "What exactly does a successful write promise?",
    walkthrough: "In the classic arrangement the caller writes through the cache provider, which synchronously writes the authoritative store as part of handling the request. An application writing SQL and Redis itself has a similar latency cost, but must explicitly own their coordination. Draw a line at acknowledgement and place each durable change relative to it. If failure occurs between changes, the system needs an outcome the caller can safely discover or retry.",
    example: "Preference update 81 commits in SQL. Redis update times out. On retry look up update 81, repopulate from the committed value, and return the established result. Avoid applying the business operation twice.",
    implications: "Ask what happens when the database commits and the cache update times out. Two successful calls are easy to describe. Partial success requires a repair policy and retries that can safely repeat the write."
  },
  "caching-strategies__write-behind-write-back-async-flush-to-db": {
    overview: "A dashboard accepts frequent counter updates in memory and flushes grouped changes to storage later. Combining writes can greatly reduce database traffic. An acknowledged update can disappear if its only copy was in the failed cache.",
    question: "What does the flush worker need to remember?",
    walkthrough: "Picture changes A, B and C arriving for the same object before the next flush. If they are full snapshots and C supersedes both previous versions, writing only C saves I/O. If they represent separate increments, dropping A and B loses business events. Record the operation semantics, ordering key and last persisted position. Until persistence catches up, a reader bypassing the cache sees an older state.",
    example: "At 2,000 accepted updates/s and 1,500 persisted/s, backlog grows by 30,000 updates per minute. Monitor oldest unflushed age and bound admission before memory or recovery time becomes unacceptable.",
    implications: "Define what the acknowledgement promises. If losing a batch is unacceptable, durably record updates before acknowledging them, monitor flush lag, and preserve ordering where later values supersede earlier ones."
  },
  "redis-caching-problems__redis-unavailable-at-peak-fail-open-vs-fail-closed": {
    overview: "Losing Redis affects a cached product description differently from losing the only record of a one-use redemption. The description can come from a slower source. Guessing whether the redemption was used can violate a business rule.",
    question: "How much origin capacity does a cache outage require?",
    walkthrough: "Start with peak request rate and miss rate. With 10,000 reads per second and a 98% hit rate, the database normally sees around 200 reads per second. If all reads fall through, demand jumps fiftyfold. Even a database with triple its usual headroom will saturate. Set a short cache deadline, stop repeated attempts while Redis is unhealthy, and budget fallback work against measured database capacity.",
    example: "For a catalogue, serve an acceptable stale copy or reject excess reads. For a redemption, use an atomic uniqueness check in the system of record or defer the request. Exercise both paths in the same outage drill.",
    implications: "Classify uses by consequence. Bound database fallback concurrency and serve a recent copy where allowed. For a correctness-sensitive operation, defer it or consult an authoritative store."
  },
  "redis-caching-problems__cache-aside-avoiding-a-stampede": {
    overview: "At noon a popular catalogue entry expires. A hundred requests observe the same miss before the first refill finishes. Ordinary cache-aside makes every caller do the expensive work.",
    question: "What happens to callers while one request refills the key?",
    walkthrough: "A per-key in-flight task lets the first request fetch from SQL and others await that same result. Check the cache again after acquiring the right to load, since another request might already have filled it. Remove the in-flight entry even after failure. A cancelled waiter should not normally cancel a load needed by many other callers. Per-key coordination keeps unrelated products independent.",
    example: "A 250 ms origin read and 400 arrivals/s for one expired key can overlap roughly 100 loads. One shared refill per process cuts this to roughly one per active replica for that expiry.",
    implications: "Share one in-flight load per key and give waiters a deadline. Process-local coordination still permits one refill per instance. Serving a slightly stale value during refresh can keep readers off the critical path."
  },
  "redis-caching-problems__distributed-lock-with-redis-pitfalls-fencing": {
    overview: "Worker A holds a Redis lease, pauses, and wakes after worker B has acquired it. A can still issue a delayed database write. Expiry only changes what the lock service believes.",
    question: "How do ownership and fencing protect different operations?",
    walkthrough: "Acquire the lease with one atomic set-if-absent operation that includes its expiry. Release it with an atomic compare-and-delete so an expired holder cannot delete a successor’s lease. That protects the Redis key. To protect an external resource, include an increasing grant number on writes and persist the greatest accepted grant with the resource. Every writer must participate, and the authority issuing grant numbers must preserve their ordering through failover.",
    example: "A receives grant 41 and pauses. B receives 42 and stores value B with epoch 42. When A finally submits 41, the destination’s conditional write affects zero rows. Extending the original TTL only makes this sequence less likely.",
    implications: "Use an owner token for safe release. For writes that require ordering, have an authority issue increasing fencing numbers and make the destination reject older numbers. A random owner token alone cannot order writers."
  },
  "redis-caching-problems__concurrent-key-update-atomic-ops-watch-multi-lua": {
    overview: "Two shoppers increment the same counter. Reading ten in both clients and writing eleven twice loses an increment. An atomic Redis increment performs the change where the value lives.",
    question: "How do you choose between one command, a watched transaction and a script?",
    walkthrough: "First express the invariant. A counter increment maps directly to a single command. A balance that may never become negative needs a conditional transition. WATCH lets a client read, calculate and commit only if the watched value stayed unchanged. With heavy contention many attempts can abort. A short server-side script can check and decrement together, with one round trip and predictable work per invocation.",
    example: "Start with stock 1 and two buyers requesting one unit. A correct result is one success, one refusal, final stock 0. Run that same contention test against each implementation.",
    implications: "For a conditional update spanning several operations, WATCH can detect interference and let the client retry. A short script can check and update on the server in one execution. Bound its runtime because other clients share that server."
  },
  "redis-caching-problems__redis-transactions-multi-exec-watch-lua-scripts": {
    source: { title: "Redis transaction semantics", url: "https://redis.io/docs/latest/develop/using-commands/transactions/" },
    overview: "MULTI queues commands and EXEC runs the queue without another client interleaving commands. A runtime error in one queued command can leave other commands applied. Design for that failure model.",
    question: "Which errors prevent the whole transaction from executing?",
    walkthrough: "A command rejected during queuing, for example due to invalid arity, can make EXEC refuse the transaction. A validly queued command can instead fail during execution because the key has an incompatible type. Redis then returns an error in that command’s result slot and continues with other queued commands. WATCH adds another outcome: another update invalidates the watched version and EXEC applies none of the queued changes.",
    example: "With k containing a string, queue an increment of a separate counter and a list push to k. The increment can succeed and the list operation fail. Inspect every result before acknowledging business success.",
    implications: "WATCH a balance before reading it if the decision to debit depends on its current value. Handle an aborted EXEC by rereading. A short Lua script can move the decision and write into one server call."
  },
  "redis-caching-problems__stackexchange-redis-correct-usage-singleton-multiplexer-timeouts": {
    overview: "Opening a Redis connection for each ASP.NET request turns a traffic spike into a connection spike. Reuse a long-lived ConnectionMultiplexer so independent requests can share connections and pipeline work.",
    question: "How can one large operation increase latency for unrelated callers?",
    walkthrough: "The multiplexer shares connections across operations. A large reply occupies network bandwidth and must be read before later replies on that connection can be consumed. Timeouts therefore measure elapsed client time as well as Redis execution. Compare server latency with outstanding operations, payload sizes, client CPU and thread-pool health. A new connection per request adds handshakes and pressure without addressing a slow consumer.",
    example: "If timeouts coincide with a bulk export of large values, restrict export size or concurrency and repeat the test. Separate bulk traffic only when measurements show it is delaying the normal path.",
    implications: "A timeout can mean commands waited behind a large reply or the client lacked CPU to process responses. Inspect latency, payload size and client queues before raising timeouts or adding connections."
  },
  "redis-caching-problems__redis-data-structures-atomic-server-side-commands": {
    overview: "Model a leaderboard as a sorted set. Adding points and reading the top ten then use server operations designed for ranked data. Serializing the entire board into one string forces competing clients to replace it.",
    question: "Which Redis type preserves the operation you need?",
    walkthrough: "A string can hold a serialized leaderboard, but adding points then requires reading, modifying and replacing the whole board. A sorted set associates each member with a score and supports an atomic increment and a bounded ranked read. A hash is a better fit for independent fields on one object. A set answers unique membership questions. Choose based on both update granularity and the largest response callers may request.",
    example: "ZINCRBY board 5 player42\nZREVRANGE board 0 9 WITHSCORES\nThe update touches one player and the read returns at most ten entries, independent of total board size.",
    implications: "Choose the structure from the operation that must be atomic. Check cardinality and command complexity too. A convenient operation returning every member can dominate latency as the board grows."
  },
  "redis-caching-problems__pub-sub-vs-redis-streams": {
    overview: "A live scoreboard can tolerate a viewer missing a notification while disconnected. Pub/Sub fits that contract. An invoice processor needs to resume after a restart, which calls for retained entries and consumer progress.",
    question: "What state survives a disconnected consumer?",
    walkthrough: "Pub/Sub sends to current subscribers and keeps no replay position. A stream appends an entry with an ID. In a consumer group, reading a new entry records a pending delivery assigned to a consumer. After the application commits its effect it acknowledges the entry. If the worker dies, another worker must claim sufficiently idle pending work. Acknowledgement updates group state while stream retention controls how long the underlying entry remains available.",
    example: "Crash a worker after its database commit and before XACK. Reclaim the pending entry and verify the business row stays unique. Then repeat with a disconnect longer than the configured retention window.",
    implications: "With Streams, consumer groups track delivered work, and workers acknowledge processed entries. Arrange recovery of pending messages and set retention to cover the longest outage the system must survive."
  },
  "redis-caching-problems__pipelining-single-threaded-execution-scan-not-keys": {
    overview: "Ten independent cache reads across a network can spend more time waiting for round trips than executing. Pipelining lets the client send subsequent commands before it receives earlier replies.",
    question: "Why can a faster batch still make other clients slower?",
    walkthrough: "Pipelining removes a wait between independent commands. It does not turn those commands into one atomic operation or reduce their server-side work. A huge pipeline also creates a burst of queued work and replies. SCAN spreads a traversal across cursor calls. COUNT is a hint and an empty batch with a nonzero cursor is possible, so iterate until the returned cursor is zero.",
    example: "At 5 ms round-trip time, twenty sequential tiny requests spend roughly 100 ms on round trips. A bounded pipeline can overlap most of that latency. A dependent second request still needs the first result.",
    implications: "A pipeline still consumes server execution time. For a keyspace walk, use bounded SCAN iterations and tolerate duplicates. A large blocking command in a pipeline still holds up other clients."
  },
  "redis-caching-problems__eviction-policies-ttl-persistence": {
    overview: "Expiry expresses how long a value is usable. Eviction selects what to remove under memory pressure. Persistence controls what Redis can recover after restart. A session can disappear through any of these paths.",
    question: "What explains a key disappearing before its TTL?",
    walkthrough: "Check expiry, memory pressure and restart separately. A cache at maxmemory may evict an eligible key according to its policy, including a key that still has minutes left on its TTL. A noeviction configuration can refuse memory-growing commands instead. After restart, recovery depends on the snapshot or append-only log and its durability configuration. None of these mechanisms replaces an authoritative record for irreplaceable data.",
    example: "Track expired_keys and evicted_keys over the incident window, inspect memory pressure and write errors, and compare uptime with restart logs. Identical “missing session” reports can have different causes.",
    implications: "Size memory and choose an eviction policy based on whether entries may be sacrificed. Test restart recovery separately and measure how much recent data the chosen persistence configuration can lose."
  },
  "redis-caching-problems__cluster-sentinel-replication-failover": {
    overview: "A primary with replicas gives Sentinel somewhere to promote traffic after failure. Cluster additionally distributes hash slots across primaries so the dataset and write load can span machines.",
    question: "What changes for the client during failover and resharding?",
    walkthrough: "Sentinel monitors a primary-replica group and coordinates promotion and discovery. Cluster divides the keyspace into slots and routes each slot to an owning primary. A cluster-aware client follows routing changes as ownership moves. Replicas improve availability, but asynchronous replication means the most recent acknowledged primary write might never reach a promoted replica. Multiple nodes also do not split a single hot key into multiple independent writers.",
    example: "In a cluster, order:{42}:header and order:{42}:lines share a hash tag so operations requiring one slot can use both. Group related data deliberately because overusing one tag can create a hotspot.",
    implications: "Failover takes time and asynchronous replication can lose acknowledged writes. Check client reconnection behavior. In Cluster, related keys used in a multi-key operation may need to share a hash slot."
  },
  "redis-caching-problems__cache-invalidation-stale-data": {
    overview: "A price edit updates SQL and invalidates a cached product. Meanwhile a slow reader that fetched the old row earlier finishes late and caches yesterday’s price. Even successful invalidation has a race.",
    question: "How would you prove your freshness guarantee?",
    walkthrough: "Specify the event starting the clock, such as the SQL commit, and the reader whose observation matters. A TTL starts at cache fill, which can occur long after a stale database read began. An invalidation event delivered through an outbox avoids silently losing a committed change, but delivery and consumption can lag or repeat. Handling monotonic versions makes an old event less likely to undo newer state.",
    example: "Instrument the committed version and the version returned by each read path. A test that pauses a reader between SQL read and cache fill reveals races a simple write-followed-by-read test will miss.",
    implications: "Use a freshness budget, versioned writes or versioned keys where appropriate. Measure the interval between committing a change and serving it consistently, especially for fields with financial consequences."
  },
  "redis-caching-problems__multi-tenant-caching-monitoring": {
    overview: "A shared cache needs the tenant in every key for tenant-specific data. A noisy tenant can still consume most memory or throughput even when key names never collide.",
    question: "What belongs in a tenant-aware cache key?",
    walkthrough: "Include the verified tenant identity, resource identifier and every input that changes the cached representation, such as permission scope, language or schema version. A tenant prefix prevents accidental collisions but does not limit how much shared memory one tenant can consume. During invalidation, a per-tenant namespace version can retire old entries without scanning every key. Let superseded entries expire to reclaim their memory.",
    example: "Two tenants both have invoice 17. Request it through the API and a background export, first cold and then warm. Verify each path derives the same tenant scope and never returns the other tenant’s representation.",
    implications: "Exercise isolation with two tenants using the same product ID. Monitor evictions, hit rate and latency by workload, and isolate workloads with materially different capacity or confidentiality requirements."
  },
  "redis-caching-problems__redis-as-a-queue-vs-a-dedicated-broker": {
    overview: "Removing a job from a simple Redis list before processing leaves a loss window if the worker crashes. Streams can retain pending deliveries, but recovery, retention and poison-message policies still need an owner.",
    question: "What must a queue provide after the happy-path dequeue?",
    walkthrough: "A queue needs a durable acceptance point, a claim policy, a completion signal and a recovery process. Popping an item off a list makes the worker the only owner immediately. A pending-message mechanism preserves evidence of work in flight, but someone must detect abandonment and retry. Compare the consequences of a broker restart, a worker pause and an overloaded consumer under the actual durability settings.",
    example: "Acceptance test: enqueue three jobs, stop one worker after claiming, restart the broker, then resume. Account for every job by stable ID, including duplicates. A messages-per-second benchmark cannot answer that question.",
    implications: "Compare the full operational contract with a broker offering acknowledgements, retries and dead lettering. Measure recovery after a worker crash as well as throughput during normal processing."
  },
  "redis-caching-problems__cache-penetration-negative-caching": {
    overview: "A request for a nonexistent product always misses a cache that stores only successful lookups. Repeated requests for the same missing ID can keep the database busy.",
    question: "How long should a negative lookup stay cached?",
    walkthrough: "Distinguish a confirmed absence from an unavailable database. Only the former is eligible for negative caching. Choose a short TTL according to how quickly a newly created object must become discoverable. Repeated misses for the same ID benefit greatly. A stream of previously unseen IDs may fill the cache while producing few negative hits, so cap admission or screen implausible identifiers cheaply.",
    example: "A search for product 73 caches “absent” for 30 seconds. If it is created five seconds later, the remaining 25 seconds are user-visible unless creation invalidates that marker.",
    implications: "Cache a distinct “absent” result briefly. Invalidate it when the product is created. A Bloom filter can cheaply screen a large keyspace if its updates stay consistent with insertions."
  },
  "redis-caching-problems__cache-avalanche-ttl-jitter": {
    overview: "Warming ten thousand entries at deployment with an identical ten-minute TTL schedules a database traffic burst ten minutes later.",
    question: "How large is the refill wave?",
    walkthrough: "Suppose 60,000 entries are created together and read frequently. A common expiry can make a large fraction miss in the same second. Uniformly spreading expirations across a two-minute window gives about 500 expirations per second on average. Refill load also depends on request frequency and coalescing. Choose the window within each item’s freshness budget, then verify origin capacity during a real burst.",
    example: "If a value must expire within ten minutes, use a randomized TTL such as eight to ten minutes. Adding two minutes to a ten-minute maximum would quietly violate the freshness requirement.",
    implications: "Spread expirations with random jitter within the freshness budget. Rehearse a genuinely cold start as well. Jitter spreads normal refreshes but cannot protect a database when every cache node restarts simultaneously."
  },
  "redis-caching-problems__cache-breakdown-a-single-hot-key-expires": {
    overview: "One celebrity profile can be responsible for half the reads. Its expiry hurts even if all other expirations are evenly distributed.",
    question: "How do soft expiry and hard expiry work together?",
    walkthrough: "Store a refresh-after time and a final serve-until time. Between them, one caller refreshes while others receive the previous value. If refresh fails, retry within a bounded budget. Beyond the hard boundary the service must fall back, defer or fail according to the domain. Set distributed lease time and the loader’s own deadline separately. One concerns coordination and the other controls resource use.",
    example: "A profile refreshed at 12:00 can start refreshing at 12:04 and be served until 12:05. Five failed refreshes must not silently extend that final minute unless the product explicitly permits emergency staleness.",
    implications: "Start refreshing before hard expiry, let one caller rebuild, and serve the previous value while permitted. Give refresh work a deadline so a failed loader cannot strand every reader."
  },
  "redis-caching-problems__hot-keys-traffic-skew-to-one-key": {
    overview: "A cluster distributes keys, yet every read of one trending object still goes to its owning shard. Adding shards may barely move that shard’s CPU usage.",
    question: "How can a balanced cluster still have one saturated node?",
    walkthrough: "Hash distribution balances placement over many independent keys. Traffic can be highly skewed even if each node holds the same number of bytes. First distinguish a read hotspot from a write hotspot. Local replicas can absorb repeated reads. Replicating a counter into ten writable copies changes the semantics because a read must combine them and concurrent updates no longer share one atomic value.",
    example: "One key receives 70% of reads over eight shards. Moving half the other keys to new shards barely changes its owner’s traffic. Measure requests and bytes per key before increasing shard count.",
    implications: "Replicate read-only copies near callers or split a workload where the operation permits it. Document how copies expire and how quickly updates need to become visible."
  },
  "redis-caching-problems__big-keys-huge-values-block-the-server": {
    overview: "A huge collection behind a single key increases network transfer, allocation and server work. It also makes moving that key during rebalancing more expensive.",
    question: "Why does one very large key affect other requests?",
    walkthrough: "A large value can consume serialization time, socket bandwidth, client allocations and migration time. Large collections can also invite operations that enumerate all members in one execution. Split by how clients read and update the data, preserving atomic groups that must change together. Use bounded page reads and independent expirations where the business model permits them.",
    example: "A 20 MB catalogue returned 50 times per second is roughly 1 GB/s of payload alone. Caching makes the database idle while the network remains the bottleneck. A paged or projected response reduces the actual work.",
    implications: "Page or partition by access pattern and cap collection size. Look at reply bytes and worst-case execution time per command alongside total memory usage."
  },
  "redis-caching-problems__cache-pollution-eviction-oom": {
    overview: "A one-time bulk scan can fill the cache with entries that nobody reads again and evict the frequently used working set. Hit rate falls despite a healthy origin and a full cache.",
    question: "How do you tell a capacity shortage from cache pollution?",
    walkthrough: "Measure reuse after admission. A one-off export touching a million distinct products can insert many values that are never hit again. Increasing memory may only delay eviction of the regular working set. Separate traffic classes, sample hit ratios by class and compare evicted entries against recently useful entries. With a volatile-only eviction policy, exhausting eligible keys can also lead to write errors.",
    example: "Replay the same traffic with export reads bypassing cache fill. If normal catalogue hit rate recovers while memory and database latency stabilize, admission policy mattered more than raw capacity.",
    implications: "Bypass low-reuse traffic or use an admission or eviction policy suited to the workload. Test under a memory ceiling and observe which writes fail or which entries get displaced."
  },
  "messaging-event-driven-systems__delivery-guarantees-at-least-at-most-exactly-once": {
    overview: "A worker commits an invoice and crashes before acknowledging the message. Redelivery is correct broker behavior. The application must decide what a repeated delivery means for the invoice.",
    question: "Where does the delivery guarantee end?",
    walkthrough: "Draw three boundaries: the broker records the message, the consumer commits its effect, and the broker records acknowledgement. At-most-once accepts a possible gap between acknowledgement and effect. At-least-once closes that gap with redelivery and introduces possible duplicates. Some systems coordinate exactly-once processing within a defined transactional boundary. A call to a separate billing API falls outside that boundary unless it participates in the protocol.",
    example: "Charge commits → worker crashes → broker redelivers. The broker delivered twice. A unique payment operation ID can still leave one committed charge, which is the guarantee a customer observes.",
    implications: "Acknowledging early risks loss. Acknowledging late permits duplicates. Describe exactly-once claims in terms of the specific store and operation covered by the guarantee."
  },
  "messaging-event-driven-systems__idempotency-duplicate-detection": {
    overview: "A retried payment request carries the same operation ID. Store that ID and the resulting payment together so the retry can return the first result.",
    question: "What happens when duplicate requests arrive concurrently?",
    walkthrough: "Checking for a prior result and then creating it in a separate step lets two callers both pass the check. Make claiming the operation ID atomic, usually with a unique constraint. Store a fingerprint of relevant input so the same ID cannot represent different intents. Define the in-progress response and store the completed outcome. Idempotency describes the effect of repetition and does not require every response header to be identical.",
    example: "First request: key K, amount 50 → payment P. Replay K with 50 → return P. Replay K with 75 → conflict. Two simultaneous requests with K must never create two payments.",
    implications: "Enforce uniqueness atomically and reject reuse of an ID with different input. Retain the result for at least the retry window or a delayed retry may become a fresh payment."
  },
  "messaging-event-driven-systems__inbox-pattern-consumer-side-dedup": {
    overview: "Two consumers receive copies of event 81. Each tries to insert its ID into an inbox table in the same database transaction as applying the business change. The unique constraint permits one committed effect.",
    question: "Which operations must share the inbox transaction?",
    walkthrough: "Record consumer identity and message ID, apply the local business update, and commit them together. If processing fails, rollback removes the claim so a retry can do real work. If commit succeeds and acknowledgement fails, a retry encounters the existing claim and finishes without repeating the update. Consumer identity matters when two independent subscriptions legitimately need to process the same message.",
    example: "Use a uniqueness key like (subscription, message_id). A single global message_id across billing and analytics would let whichever subscription ran first suppress the other’s legitimate work.",
    implications: "Acknowledge after commit. A crash before acknowledgement causes another delivery, which the inbox can recognize. Decide when inbox records can expire given replay and redelivery requirements."
  },
  "messaging-event-driven-systems__outbox-pattern-reliable-publish-after-a-db-write": {
    overview: "Saving an order and publishing OrderPlaced are separate failure points. Insert a pending event alongside the order in one database transaction. A relay later publishes committed events.",
    question: "How does the outbox relay know it can mark a row sent?",
    walkthrough: "The relay reads committed rows, publishes an event with a stable ID, waits for broker confirmation and then records progress. Marking sent first risks loss. Marking after confirmation risks duplication if the relay crashes. A committed outbox row gives the team a durable recovery point. If ordering matters per order, include its sequence and ensure relay concurrency preserves the required order.",
    example: "Pending events 7 and 8 belong to the same order. Two relays can publish 8 before 7 even though both publishes succeed. Partition relay ownership or let consumers detect sequence gaps.",
    implications: "A relay crash after publication and before marking the row sent causes duplication. Give events stable IDs and make consumers safe to replay. Monitor the age of the oldest pending row."
  },
  "messaging-event-driven-systems__ack-redelivery-visibility-timeout-peek-lock": {
    overview: "Peek-lock hides a message temporarily while the worker processes it. Completing the message after the transaction commits removes it. If the lease expires, a second worker may receive it while the first is still running.",
    question: "How does a lock deadline differ from processing completion?",
    walkthrough: "A broker lease gives a worker temporary delivery ownership. It cannot observe whether a SQL transaction actually committed. Long processing, CPU pauses or delayed acknowledgements can make the lock expire before completion arrives. Renew while the worker is healthy, detect renewal failure, and keep the database commit independently safe to replay. Extending locks indefinitely makes genuinely abandoned work take longer to recover.",
    example: "Processing starts at 00:00 under a 30-second lock. SQL commits at 00:29. Completion reaches the broker at 00:31. Record both the durable effect and the lost lock when explaining the apparent duplicate.",
    implications: "Bound processing time or renew the lock, and handle failed renewal. An idempotent commit remains valuable because acknowledgement itself can be lost."
  },
  "messaging-event-driven-systems__retries-backoff-dead-letter-queues-dlq": {
    overview: "A temporarily unavailable database may recover before the next delivery. A malformed order will fail identically on every attempt. Treating both alike wastes capacity and delays healthy messages.",
    question: "How do retries interact with backlog and retention?",
    walkthrough: "Each attempt consumes worker time and can hold a scarce downstream connection. An immediate retry helps a very brief failure, while scheduled retries release capacity during a longer outage. Classify permanent validation failures separately and retain the original payload, operation ID and failure reason when dead lettering. Track the age of the oldest failed item so the dead-letter queue has an operational owner.",
    example: "At three retries plus the original delivery, 1,000 permanently failing items can trigger 4,000 processing attempts before isolation. Replay only after fixing the cause and preserving deduplication identity.",
    implications: "Retry transient failures with spaced, bounded attempts. Move persistent failures to a dead-letter queue with enough context to diagnose them, then replay after correction using the original operation ID."
  },
  "messaging-event-driven-systems__ordering-partitioning-sessions": {
    overview: "Requiring a total order across all customer updates sacrifices concurrency. If only changes for a single customer must stay ordered, route that customer’s events to the same partition or session.",
    question: "What must remain ordered during a retry?",
    walkthrough: "A broker can preserve enqueue order for one session while application code still commits effects out of order. If event 10 fails and is scheduled for later while 11 completes, delivery ordering no longer implies business ordering. Decide whether to block the session, park later events or support a commutative update. Put unrelated customers in different sessions to preserve parallelism.",
    example: "OrderCreated v1, OrderPaid v2, OrderShipped v3. If a projection has version 1 and receives 3, record the gap and recover 2 before treating shipment as the current state.",
    implications: "Preserve order through processing as well as delivery. Concurrent handlers, retries and a skipped poison message can reorder visible effects. Sequence numbers can expose gaps."
  },
  "messaging-event-driven-systems__concurrent-handlers-transactions": {
    overview: "Two workers can both read the last unit of stock before either saves its reservation. A transaction around each handler helps only if the database also enforces the stock invariant.",
    question: "Which database condition actually protects the last unit?",
    walkthrough: "Checking stock in application memory leaves time for another handler to consume it. Put the quantity check and decrement in one conditional database update. Affected row count becomes the decision. Insert the reservation and processed-message record in the same transaction so a successful decrement always has a matching reservation. Roll back the whole unit if any step fails.",
    example: "UPDATE inventory SET stock = stock - 1 WHERE sku = @sku AND stock >= 1\nOne affected row grants the reservation. Zero rows means insufficient stock or an unknown SKU, which the domain may distinguish separately.",
    implications: "Use a conditional decrement or suitable isolation, and check affected rows. Include deduplication in the transaction so a redelivery cannot reserve the same item again."
  },
  "messaging-event-driven-systems__external-side-effects-the-dual-write-hazard": {
    overview: "A worker commits a subscription then calls an email provider. Crashes can leave a committed subscription with no email, or a sent email with no local success record.",
    question: "How do you reconcile an external service with no idempotency support?",
    walkthrough: "An outbox makes the local intent durable but cannot force a provider to execute exactly once. If the call times out, the outcome may be unknown. Query provider history by a stable business reference if possible. If that is impossible, document which cost the business accepts: a missed notification, a possible duplicate, or a manual review step. A local sent flag alone cannot remove the ambiguity.",
    example: "Provider receives email E and closes the connection before replying. A row still marked pending is evidence that success was never recorded. It is insufficient evidence that nobody received E.",
    implications: "Persist the intent with the subscription and send it asynchronously. Use provider idempotency keys when available. Define reconciliation for ambiguous outcomes when the external service cannot deduplicate."
  },
  "messaging-event-driven-systems__azure-service-bus-vs-redis-streams": {
    overview: "A team that needs scheduled delivery, sessions and dead lettering can use Service Bus as a managed broker. A Redis Streams consumer group offers a retained log with pending-entry tracking on existing Redis infrastructure.",
    question: "Which features change what the team has to build?",
    walkthrough: "Compare a failed delivery end to end. With Service Bus, a PeekLock receiver can settle or abandon the delivery and broker settings can dead-letter after repeated attempts. With Streams, a consumer group records pending delivery, and the application chooses claim thresholds, retry classification and dead-letter handling. In either case, the consumer must commit its effects safely before recording completion.",
    example: "For a two-hour outage, estimate backlog bytes, retention, time to catch up, and operator steps to find permanently bad records. Compare those results at the required durability and replication settings.",
    implications: "Compare outage recovery, replay, retention and operational ownership. Benchmarking a clean publish path alone misses the work of reclaiming abandoned deliveries and isolating repeatedly failing records."
  },
  "messaging-event-driven-systems__backpressure-poison-messages": {
    overview: "If workers process fifty jobs per second and arrivals sustain a hundred, a queue buys time while its age keeps growing. One repeatedly failing message can consume still more worker capacity.",
    question: "Why can accepting more work reduce successful throughput?",
    walkthrough: "Buffers absorb variation for a while. When a slow dependency stays saturated, more queued jobs age past their deadlines, occupy memory and compete with fresh work that could still succeed. Apply a bounded buffer and signal producers to slow down or reject excess work. Quarantine a repeatedly failing item so one bad payload cannot consume every retry slot.",
    example: "At 100 arrivals/s and 50 completions/s, backlog grows by 3,000 jobs each minute. Restoring capacity to exactly 100/s stops further growth but never drains those accumulated jobs.",
    implications: "Bound concurrency and buffering, slow producers where possible, and isolate poison messages after limited attempts. Oldest-message age shows the customer impact more directly than depth alone."
  },
  "infrastructure-as-code__what-iac-is-why-it-matters": {
    overview: "A reviewed configuration declaring a network and database lets a team recreate an environment and inspect proposed changes in version control. The running resources still have state, identity and data outside the files.",
    question: "What makes a declaration reproducible?",
    walkthrough: "A useful declaration states the resource identity, intended properties, dependencies and ownership boundary. The tool compares desired and observed state and issues the changes it can manage. Idempotence means rerunning an unchanged configuration under stable conditions should converge with no further changes. External defaults, an unpinned module version or a generated name can violate the expectation that two runs produce the same result.",
    example: "Provision a disposable environment and plan again. Investigate any persistent differences. Then change one input and verify that only resources depending on it are proposed for modification.",
    implications: "Review deletion and replacement plans carefully. Reproducible infrastructure does not restore production data. Exercise both provisioning and recovery."
  },
  "infrastructure-as-code__terraform-fundamentals-providers-resources-plan-apply": {
    overview: "Terraform providers translate resource declarations into service API calls. Planning compares configuration, state and observed infrastructure to propose actions. Applying executes the selected dependency graph.",
    question: "What does Terraform actually know at plan time?",
    walkthrough: "A provider supplies resource schemas and communicates with its service. Terraform builds dependencies from references, refreshes managed objects and proposes create, update, replacement or deletion. Some values, such as a generated resource ID, remain unknown until apply. An apparently small input change can require replacement if the provider cannot update that property in place. A saved plan preserves the reviewed proposal, subject to the real infrastructure still permitting it.",
    example: "A network change proposes replacing a subnet and dependent interfaces. Count affected workloads and verify a migration path before treating the plan as a routine configuration edit.",
    implications: "A rename that changes a resource address can appear as destroy and create. Review replacement actions and use a move declaration when preserving the existing resource identity."
  },
  "infrastructure-as-code__state-locking-remote-backend": {
    overview: "Terraform state maps resource addresses to real objects. Two simultaneous writers using outdated mappings can conflict even if each configuration parses correctly.",
    question: "What protection does state locking provide?",
    walkthrough: "A supported lock serializes Terraform operations that would write the same state. It does not stop a person changing a resource through the cloud console or protect two independently managed states that describe the same resource. Losing state usually loses Terraform’s mapping while the deployed objects keep running. Recovery means restoring a known state or re-associating existing resources carefully, then planning before applying.",
    example: "Two pipelines target one production backend. The second should wait or fail clearly on the lock. If both succeed independently, check whether their backend paths actually point at different state objects.",
    implications: "Use a remote backend with access controls, backups and supported locking. State may contain sensitive attributes. Investigate a stuck lock before releasing it because the original writer may still be active."
  },
  "infrastructure-as-code__modules-reuse": {
    overview: "A database module can encode a team’s backup and encryption defaults while exposing inputs for capacity and recovery requirements. Its outputs give callers stable references to provisioned resources.",
    question: "Where should a module boundary fall?",
    walkthrough: "Choose a group whose resources share an owner and lifecycle, such as a database, its backup policy and monitoring. Expose decisions callers genuinely need, including the recovery target. Keep implementation details behind outputs so changing an internal resource address does not force every consumer to adopt the same change. Module versioning helps only when consumers can preview changes before updating.",
    example: "Add a replica-count input with an existing compatible default. Plan against a representative older caller and a caller opting in. Review both plans for accidental replacement of the primary database.",
    implications: "Version the module and inspect upgrade plans in a representative environment. A sprawling set of switches often signals multiple resources with different lifecycles deserve separate modules."
  },
  "infrastructure-as-code__environments-workspaces-vs-directories": {
    overview: "Workspaces let one configuration address separate state instances. Separate root directories can express different providers, permissions or topologies more explicitly.",
    question: "How would you prevent a test change reaching production?",
    walkthrough: "Separate resource identity, state and permissions. A workspace can select different state with the same root configuration, which suits similar ephemeral environments. Independent roots can share modules while using distinct backends, credentials and release cadence. The critical control is whether a test pipeline identity can write production resources or state, regardless of directory names.",
    example: "For a production plan, display the target subscription or account, backend state key and planned resource addresses. A review should make the wrong environment recognizable before any apply.",
    implications: "Choose the boundary by blast radius. Verify which credentials and state a production plan uses. An environment name in a shell prompt provides little protection from applying to the wrong account."
  },
  "infrastructure-as-code__drift-detection": {
    overview: "An operator expands a firewall rule manually. The configuration file has stayed the same, but the deployed environment has drifted. A refreshed plan can reveal the difference.",
    question: "Does a clean plan prove the environment matches the architecture?",
    walkthrough: "A plan compares only the resources and attributes under management, subject to lifecycle rules and provider visibility. An unmanaged resource or an ignored property can escape detection. Scheduled plans shorten detection time, while audit logs can identify who changed an object and why. If an emergency change was legitimate, update configuration first and review the plan that reconciles ownership.",
    example: "Change a managed tag and add an unrelated unmanaged resource in a test account. Observe which appears in a refreshed plan. That experiment defines the limits of drift detection for that root.",
    implications: "Decide whether the manual change was an incident fix to preserve or an unauthorized change to reverse. Reconcile configuration and reality through review before an automated apply overwrites the decision."
  },
  "infrastructure-as-code__import-migration-of-existing-resources": {
    overview: "Import associates an existing resource with an address in state. The written configuration must still describe the resource accurately enough for the next plan to preserve it.",
    question: "How do import and moving an address differ?",
    walkthrough: "Import brings an already existing remote object under a new state mapping. Moving an address preserves the mapping when configuration structure changes, for example while extracting a resource into a module. Neither should create a second remote object. After import, provider defaults and omitted attributes can produce unexpected edits. Reconcile them before applying the first normal change.",
    example: "Existing database db-prod is imported at its intended address. Success means the next reviewed plan proposes the intended state, ideally no change. A successful import command alone says nothing about the next apply.",
    implications: "Import a small group, inspect the plan for replacements and unexpected defaults, then expand. Keep a recovery copy of state and ensure only one configuration manages each object."
  },
  "infrastructure-as-code__arm-bicep-azure-native-iac": {
    overview: "Bicep describes Azure resources symbolically and compiles into ARM templates. Referencing a resource’s properties can express dependencies without hard-coding deployment order.",
    question: "How does Bicep resolve dependencies and scope?",
    walkthrough: "A symbolic reference such as using a storage account’s ID in another resource provides a dependency that ARM can schedule. Independent resources can deploy concurrently. Modules can target supported scopes such as subscriptions or resource groups, but the deployment identity still needs rights there. Declaring an existing resource lets the template reference it without claiming it was created by that deployment.",
    example: "If a deployment creates storage but fails on a role assignment, inspect the authorization scope for role assignments. Retrying unchanged code with the same insufficient permissions cannot repair the failure.",
    implications: "Use a what-if preview and review the deployment scope. A template validated at resource-group scope can still fail when its identity lacks permission to create a role assignment."
  },
  "infrastructure-as-code__pulumi-cloudformation-ansible-the-differences": {
    overview: "Pulumi expresses desired cloud resources in a programming language. CloudFormation manages AWS resources as stacks. Ansible runs tasks against machines and services and is often useful for configuring existing hosts.",
    question: "How would you choose tools for provisioning and host configuration?",
    walkthrough: "Compare execution model, state ownership and operating responsibility. Pulumi programs calculate desired resource declarations and use providers and state to reconcile them. CloudFormation asks AWS to manage the lifecycle of a stack. Ansible tasks often bring packages and service files on existing hosts into a desired condition. Modules can be idempotent, while an arbitrary shell task requires the author to establish that property.",
    example: "One tool owns the VM and network interface. Ansible owns the package and service config inside it. Write down who owns firewall policy if it can be set at both the cloud and host layers.",
    implications: "Pick ownership boundaries before mixing tools. If two tools reconcile the same setting differently, every successful run can undo the previous one."
  },
  "infrastructure-as-code__ci-cd-secrets-rollback-for-iac": {
    overview: "An infrastructure pipeline can validate and preview a change on review, then apply the reviewed plan with a narrowly scoped identity. Protect plan artifacts and state because they can contain sensitive values.",
    question: "What should happen after a partially successful infrastructure change?",
    walkthrough: "An apply may create a network before failing to provision a database. Read the actual failure, state and provider events, then generate a fresh plan. Automatic reversal can be more destructive than finishing the deployment. Use scoped workload identities and keep sensitive plan artifacts under access control. For a database replacement, the recovery plan needs a tested backup and a way to redirect clients.",
    example: "Review scenario: the configuration rollback recreates the original database name with empty storage. The resource now looks healthy to monitoring. Verify a known pre-change business record before calling recovery complete.",
    implications: "Reverting a configuration commit may replace resources or leave deleted data gone. Inspect the reverse plan and build a separate restore procedure for stateful services."
  },
  "grasp-patterns__information-expert": {
    overview: "An Order already knows its lines and their quantities, so it can compute the subtotal without a service pulling all the fields out. Responsibility follows ownership of the information.",
    question: "How do you locate the expert when the data spans objects?",
    walkthrough: "Follow the question through the object graph. A line knows its unit price and quantity, so it can compute an extended price. An order knows its collection of lines and can sum them. A discount policy may know rules based on customer tier. Each object answers the question for which it owns the relevant facts. This preserves invariants and avoids exposing raw mutable lists just so another object can calculate.",
    example: "For two lines, 3 × 10 and 2 × 7, ask each line for its extended price and the order for 44. Test currency or rounding rules at the object responsible for applying them.",
    implications: "If tax depends on jurisdiction rules maintained elsewhere, pass that policy in. Information Expert helps place behavior without making the order responsible for every fact a sale involves."
  },
  "grasp-patterns__creator": {
    overview: "An Order owns its lines and enforces whether a line may be added. An AddLine method can construct a valid line and attach it in one operation.",
    question: "Who should construct an object with invariants?",
    walkthrough: "List the information construction needs and the object responsible for owning the result. Adding an order line needs product, agreed price and quantity, plus the order’s current state. The order can reject additions after checkout and attach a valid line before exposing it. If price discovery uses an external service, obtain the quote outside that construction path and pass the agreed inputs into the aggregate.",
    example: "Call AddLine on a closed order. Verify both that it fails and that the order’s line count and total stay unchanged. That test distinguishes a genuine construction boundary from a public list wrapper.",
    implications: "Delegate to a factory when construction requires complex external dependencies. Keep the aggregate responsible for deciding whether the result belongs in its current state."
  },
  "grasp-patterns__controller": {
    overview: "An HTTP handler receives a cancellation request, identifies the order and delegates to an application operation. The controller coordinates an incoming system event while the order decides if cancellation is allowed.",
    question: "What should the controller own during a use case?",
    walkthrough: "A controller accepts an input event, translates transport concerns and invokes an application use case. The use case loads state, invokes domain behavior and arranges persistence. A controller can return a conflict when the operation reports an already-shipped order, but it should not contain the rule deciding whether shipment prevents cancellation. Otherwise batch callers and HTTP clients can produce different results.",
    example: "Exercise CancelOrder from an HTTP action and from a support workflow. Both should reject the same shipped order even though one returns an HTTP status and the other records an operator-facing result.",
    implications: "Reuse the operation from a queue consumer. If the rule must be copied from the HTTP handler, the controller has absorbed business behavior."
  },
  "grasp-patterns__low-coupling": {
    overview: "Sending receipts through an interface shaped around “deliver a receipt” keeps payment processing independent of a mail vendor’s SDK. A vendor change then affects the adapter.",
    question: "How do you measure coupling in a code review?",
    walkthrough: "Take a plausible change such as switching an email provider from synchronous acceptance to queued submission. Trace whether the change affects a single adapter, every checkout caller, or even the domain model. Coupling includes timing, failure semantics, schema and ownership as well as type references. Design the application-facing contract around a promise you can actually preserve across providers.",
    example: "If the domain calls a receipt “delivered” as soon as a vendor accepts it, a replacement provider exposes a hidden assumption. Use distinct accepted and delivered outcomes when the workflow depends on that distinction.",
    implications: "Check which changes actually propagate across the boundary. An interface that exposes vendor exceptions and message types still couples callers to the vendor."
  },
  "grasp-patterns__high-cohesion": {
    overview: "A class that prices orders, writes audit files and formats emails changes for three different reasons. Group the pricing rules together so a discount change can be understood in one place.",
    question: "What is a practical test for cohesion?",
    walkthrough: "List the reasons a unit changed over the last few releases. If one class changed because of pricing policy, SMTP formatting and tax report layout, its responsibilities have different owners and lifecycles. Conversely, three methods that all enforce the same rounding rule belong close together. Cohesion helps a reviewer understand a whole invariant without chasing calls across unrelated infrastructure.",
    example: "A discount rollout should require editing and testing the pricing policy. If the rollout also requires changing an email service just to repeat the calculation, the pricing behavior has leaked across boundaries.",
    implications: "Trace a representative change through the code. Splitting every method into its own service can scatter a single cohesive rule across many files."
  },
  "grasp-patterns__polymorphism": {
    overview: "Different delivery methods calculate a quote differently. A shipping policy per method lets checkout ask for a quote through one contract and delegates the variation to the selected object.",
    question: "How does polymorphism replace a growing decision tree?",
    walkthrough: "Define a contract for the result that callers need, such as quoting shipment for a parcel. Each shipping policy supplies that behavior. The composition boundary selects the policy from the order or configuration. Checkout invokes it without inspecting which carrier it is. This works only when all policies honor compatible preconditions, result units and failure behavior.",
    example: "One carrier quotes cents and another quotes whole currency units. Both implement the same method signature, yet composition breaks. Return an explicit money value and run the same contract tests against each policy.",
    implications: "Verify each policy handles units, currency and errors consistently. For a small closed set with trivial behavior, a single explicit selection may remain easier to read."
  },
  "grasp-patterns__pure-fabrication": {
    overview: "A repository is an invented software object with no physical counterpart in the business. It centralizes persistence details that would otherwise make an invoice depend on database queries.",
    question: "When does an invented service improve the model?",
    walkthrough: "A pure fabrication earns its place by moving technical behavior away from objects that would otherwise lose cohesion. A receipt repository can translate between storage rows and receipt aggregates while the receipt owns its refund invariant. Define the repository contract in terms the use case needs. A generic database wrapper that exposes arbitrary queries leaves persistence decisions spread across the domain.",
    example: "Replace SQL storage with an in-memory adapter in a domain workflow test. If the test still needs SQL column names or transaction syntax, the fabricated boundary has failed to hide the intended concern.",
    implications: "Give the new object a specific responsibility. A generic helper collecting unrelated methods moves the disorder without improving cohesion."
  },
  "grasp-patterns__indirection": {
    overview: "An adapter between checkout and an external tax system translates amounts, errors and deadlines. Checkout can now evolve independently of the provider’s wire format.",
    question: "What does an intermediary need to translate?",
    walkthrough: "Tax providers may report an amount in minor units, use different rounding rules and return retryable timeouts. An adapter converts the stable internal request into provider input and maps the response into an agreed domain result. Indirection costs an extra place to debug, so specify what changes it is designed to absorb and what remains visible to callers.",
    example: "Provider A returns 425 cents. Provider B returns 4.25 in major units. Give the same order to each adapter and verify the application sees the same currency, amount and rounding rule.",
    implications: "The intermediary earns its place by doing a specific translation. Trace a provider contract change and see whether code outside the adapter must change too."
  },
  "grasp-patterns__protected-variations": {
    overview: "Protect a likely point of variation with a stable contract. For example, define the decision the application needs from a fraud scorer and translate each provider’s answer into that decision.",
    question: "How do you protect variation without designing for imaginary futures?",
    walkthrough: "Identify a specific unstable decision and the callers that need protection. In fraud scoring, the stable operation might be approve, decline or route to review. Provider-specific scores have different distributions and may require different thresholds. Map the provider’s response at the boundary and retain the underlying decision evidence for audit. Add more abstraction only when another real use reveals the need.",
    example: "When a new provider returns “insufficient history,” decide whether the business routes to review. Returning a magic score of zero would silently turn missing information into a policy decision.",
    implications: "Specify what happens when the scorer is unavailable or uncertain. Abstracting method names alone leaves callers tightly coupled to the first provider’s failure behavior."
  },
  "c-language-fundamentals__value-vs-reference-types-the-stack-heap-truth": {
    overview: "Assigning a struct copies its value. Assigning a class variable copies a reference, so two variables can point to one mutable object. A struct inside a class lives inline within that object.",
    question: "What gets copied when a value contains a reference?",
    walkthrough: "Struct assignment copies its fields. If a field is a reference to a list, both struct copies now contain references to that same list. This is a shallow field copy. A struct stored in an array is usually inline in that array. A struct converted to object can be boxed into a managed object. Those placement details follow from use and do not change the fundamental assignment semantics.",
    example: "Given a struct with Count and List<int> Items, copy it to b. Setting b.Count leaves a.Count alone. Calling b.Items.Add(7) changes the list visible through a.Items as well.",
    implications: "Choose semantics first. A large mutable struct copied from a property can be expensive and surprising. Storage location depends on where the value lives and what the runtime optimizes."
  },
  "c-language-fundamentals__class-vs-struct-vs-record-when-each": {
    overview: "Use a class for a shared object with identity, a small readonly struct for a frequently passed value, and a record when value-based equality and convenient copying match the model. Records can be classes or structs.",
    question: "Which representation fits a monetary amount, customer and command?",
    walkthrough: "An amount with currency has value semantics and can be a small readonly record struct. A tracked customer usually has identity across many changes, making a class natural. An immutable-looking update command can use a record class for concise construction and value equality. Synthesized record equality compares components using their own equality semantics, which matters for arrays and mutable collections.",
    example: "Two records holding different arrays with identical elements can compare unequal because arrays normally use reference equality. Test the meaning of equality that your domain requires before using the type as a cache key.",
    implications: "A record copy is shallow. Two copies of a record containing a mutable list may still share that list. Test the equality and mutation behavior the domain actually requires."
  },
  "c-language-fundamentals__generics-covariance-contravariance-in-out": {
    overview: "A producer of cats can serve a reader expecting animals, so a suitable generic interface can mark its parameter out. A handler able to accept any animal can handle cats through an in parameter.",
    question: "Which conversions should the compiler permit?",
    walkthrough: "A producer only returns T, so substituting a producer of a more specific reference type is safe. A consumer only accepts T, so one capable of handling a broader type is safe at a narrower call site. The in and out modifiers express those restrictions on eligible interfaces and delegates. Constraints such as where T : IDisposable answer a separate question about which operations generic code may perform.",
    example: "IEnumerable<string> names = new[] { \"Ada\" };\nIEnumerable<object> values = names;\nAction<object> log = Console.WriteLine;\nAction<string> logName = log;",
    implications: "A mutable list both reads and writes, so the same substitution would let someone insert a dog into a list of cats. Variance conversions here apply to reference types."
  },
  "c-language-fundamentals__delegates-func-action-events-multicast": {
    overview: "A delegate packages a callable with its target. Func returns a result and Action returns void. An event gives subscribers add/remove access while the declaring type controls raising it.",
    question: "What state does a delegate keep alive?",
    walkthrough: "An instance-method delegate holds a target as well as a method. An event publisher holding subscribed delegates can therefore keep subscribers reachable. This matters when a singleton event source outlives short-lived views. Multicast delegates call subscribers in invocation-list order. If subscribers need independent failure handling or awaited completion, model that policy explicitly rather than assuming ordinary event invocation supplies it.",
    example: "Open and close the same view ten times without unsubscribing from a singleton. One event can invoke ten handlers and the closed views may remain alive. Pair subscription with the view’s actual lifetime.",
    implications: "Multicast invocation is sequential by default. A thrown exception can interrupt later subscribers, and a returning delegate exposes only the last result. Define delivery expectations before using events for critical work."
  },
  "c-language-fundamentals__equals-vs-and-the-gethashcode-contract": {
    overview: "Two CustomerId values representing the same ID should compare equal and produce the same hash. Different IDs may share a hash because a dictionary also checks equality within candidate entries.",
    question: "Why does a dictionary require both a hash and an equality rule?",
    walkthrough: "The hash narrows the search to a bucket, then equality identifies the matching key. The contract requires that equal keys give equal hashes under the same comparer. The converse is unnecessary. Equality operators are selected according to type and overload resolution, while virtual Equals and IEquatable<T> have their own dispatch rules. A comparer can define rules for one dictionary without changing global domain equality.",
    example: "A case-insensitive username lookup needs both hashing and comparison to ignore the same case distinctions. Construct the dictionary with StringComparer.OrdinalIgnoreCase and retrieve a value inserted under a different capitalization.",
    implications: "Keep equality-relevant fields stable while a key is stored. If you overload the equality operator, align it with Equals so callers see consistent value semantics."
  },
  "c-language-fundamentals__boxing-and-unboxing": {
    overview: "Passing an int as object creates a boxed copy. Changing the original variable later cannot change the value in the box. Unboxing requires the matching value type before any numeric conversion.",
    question: "What happens at the boxing boundary?",
    walkthrough: "Boxing allocates storage containing a copy of the value and returns an object reference. Unboxing checks the actual boxed type. A boxed int cannot be directly unboxed as long even though an unboxed int converts numerically to long. Interfaces can also introduce boxing for structs. Constrained generic calls can avoid boxing when invoking suitable operations on a value type.",
    example: "int quantity = 7;\nobject saved = quantity;\nquantity = 8;\nlong recovered = (int)saved; // unbox int, then widen to long. Result: 7.",
    implications: "In a hot path, prefer generic collections or constrained generic calls to avoid repeated boxing. Measure allocations because surrounding formatting and logging can also allocate."
  },
  "c-language-fundamentals__nullable-reference-types": {
    overview: "A nullable annotation tells the compiler which references may be absent. Flow analysis can see that a guard before dereferencing a local variable makes the access safe.",
    question: "What does a nullable warning actually prove?",
    walkthrough: "Nullable annotations and flow analysis describe the compiler’s current understanding of reference state. A return type of string? asks the caller to handle absence. A guard establishes a fact on a control-flow path. External serializers, legacy assemblies and reflection can supply null despite a nonnullable annotation. Validate such inputs when converting them into trusted domain objects and keep optionality explicit through the call chain.",
    example: "TryGetValue may report failure while the outgoing value has its default. Branch on the success flag before using the value. Adding ! only changes analysis and cannot turn an absent entry into a value.",
    implications: "External input can still violate an annotation. Validate at boundaries and reserve the null-forgiving operator for facts established elsewhere. It suppresses a warning without adding a runtime check."
  },
  "c-language-fundamentals__string-immutability-stringbuilder-interning": {
    overview: "Concatenating many pieces in a loop repeatedly copies previous characters into new strings. StringBuilder accumulates pieces and creates the final string once. A simple fixed expression may already compile efficiently.",
    question: "How do you identify a quadratic string-building loop?",
    walkthrough: "Appending a small token to an immutable string creates a new result and copies the previous contents. For n one-character appends, the total characters copied can grow like 1 + 2 + ... + n. A StringBuilder amortizes growth through mutable internal storage and pays for a contiguous final string when converted. Avoid building any full string at all when a response can be written incrementally.",
    example: "For 10,000 one-character appends the naive model copies about 50 million characters. Compare allocated bytes as well as elapsed time, and benchmark a realistic token size and encoding path.",
    implications: "Interning shares canonical string instances but can keep values alive for a long time. Avoid interning an unbounded stream of user values to save a few comparisons."
  },
  "c-language-fundamentals__exception-handling-best-practices": {
    overview: "Catch exceptions where you can recover, translate them into a boundary contract, or add useful context. In a catch block, a bare throw preserves the original stack when passing the same exception upward.",
    question: "Where should you catch, retry and translate an exception?",
    walkthrough: "Catch where a decision is possible. A repository may translate a known constraint violation into a meaningful domain result. A retry policy belongs where idempotency and the deadline are known. A request boundary can translate an unexpected failure into a safe response and log the original diagnostic context. Catching Exception everywhere can accidentally swallow cancellation or convert temporary infrastructure failures into permanent business rejections.",
    example: "Inside a catch block use throw to preserve the original throw location. When introducing a meaningful higher-level exception, retain the original as InnerException and include the operation context without leaking sensitive request values.",
    implications: "Log at the point that owns the failure. Logging the same exception in five layers makes one failure look like five incidents. Keep cancellation distinct from unexpected faults."
  },
  "c-language-fundamentals__idisposable-using-iasyncdisposable": {
    overview: "A stream may hold an operating-system handle even though its managed wrapper occupies little memory. A using scope guarantees timely disposal when control leaves the scope, including on exceptions.",
    question: "How does disposal behave when exceptions cross the scope?",
    walkthrough: "A using statement or declaration arranges cleanup when execution leaves its scope, similar to a finally. Many managed wrappers return resources to a pool or flush a buffer on disposal. Await using awaits DisposeAsync so asynchronous cleanup can finish before subsequent work assumes the resource is released. Establish ownership explicitly when wrapping streams since disposing an outer wrapper can dispose its underlying stream.",
    example: "If a method receives a stream owned by the caller, use a wrapper’s leaveOpen option where appropriate. Test by reading or writing through the original stream after the wrapper has finished.",
    implications: "Use await using when releasing a resource has asynchronous work. Clarify ownership when accepting an injected stream. Disposing somebody else’s stream can break the next consumer."
  },
  "c-language-fundamentals__span-t-memory-t-for-performance": {
    overview: "Parse a slice of a request buffer with Span to avoid allocating a substring or a copied array. Memory can represent a slice that must survive an asynchronous operation.",
    question: "Why can Memory cross an await while a span cannot remain live across it?",
    walkthrough: "Span<T> is a stack-restricted view over contiguous storage. Keeping a live span across an asynchronous suspension would require putting it into the state machine’s preserved state. Memory<T> is a storable descriptor for compatible backing memory. Hold Memory across the await, obtain a span only while processing synchronously, and ensure any rented buffer remains owned until the last asynchronous use finishes.",
    example: "Read bytes asynchronously into Memory<byte>, await completion, then pass only the received slice to a synchronous parser. Returning the array to its pool before the read completes lets another operation overwrite the same storage.",
    implications: "A slice does not take ownership. Keep rented storage until the last consumer finishes, then return it. A tiny slice retained for a long time can keep a large backing buffer alive."
  },
  "c-language-fundamentals__solid-with-a-concrete-net-example-for-each": {
    overview: "In checkout, separate receipt formatting from pricing (SRP), add discount policies through a contract (OCP), and require each policy to honor the same amount and currency guarantees (LSP).",
    question: "How do the five principles interact during a real change?",
    walkthrough: "Suppose checkout gains a loyalty discount. Pricing and receipt layout have different reasons to change, so separate those responsibilities. A new policy can implement a pricing extension point. Every implementation must preserve invariants such as currency and permitted totals. Reporting clients need only a read contract. Finally wire concrete payment and pricing adapters at composition so high-level checkout rules can be tested without the provider SDK.",
    example: "A useful acceptance test runs a new loyalty policy through ordinary checkout with a fake payment port. Assert the charge equals the priced order and that the receipt displays that same total without recalculating it.",
    implications: "Give reporting a read-only interface instead of refund commands (ISP). Let checkout depend on a payment abstraction that an adapter implements (DIP). Judge the design by the next realistic change it simplifies."
  },
  "c-language-fundamentals__async-void-why-dangerous-when-acceptable": {
    overview: "A caller can await a Task to observe completion, cancellation or failure. An async void operation gives that caller no such handle, which makes ordinary composition and error handling unreliable.",
    question: "Why does wrapping an async void call in try/catch fail?",
    walkthrough: "The caller receives control when the method suspends and has no Task representing its later execution. A later exception is delivered according to the async void context and can surface outside the caller’s catch scope. Tests may finish before assertions in the operation run. A Task-returning operation ties completion, exceptions and cancellation to a value the caller can observe.",
    example: "For a button click, await SaveAsync inside the void event handler’s own try/catch and update the view there. Unit-test SaveAsync directly by awaiting it, including its failure path.",
    implications: "UI event signatures may require void. Keep the handler thin, await a Task-returning operation inside it, and handle exceptions at the event boundary."
  },
  "c-language-fundamentals__yield-return-deferred-execution": {
    overview: "Calling an iterator method obtains a sequence. The body runs as the consumer requests each element. Stopping after the first match may avoid reading the rest of a large input.",
    question: "When do parameter validation and resource acquisition run?",
    walkthrough: "In an iterator method, even statements textually before the first yield usually run on the first MoveNext, not when the method is called. An invalid argument can therefore be reported far from its caller. For eager validation, use an ordinary wrapper that validates immediately and returns an inner iterator. Keep acquisition inside the iterator if opening the resource before enumeration would leak it when nobody consumes the sequence.",
    example: "Call ReadLines(path) and discard the returned sequence. A lazy implementation opens nothing. Enumerate one element and break. The enumerator’s disposal should close the reader even though most lines were never read.",
    implications: "Exceptions and resource usage therefore occur during enumeration. Ensure resources outlive that enumeration, and materialize deliberately if the caller needs a stable snapshot."
  },
  "c-language-fundamentals__modern-c-features-pattern-matching-primary-constructors-collection-exp": {
    overview: "A decoder can pattern-match message shapes, use a primary constructor for its dependencies, and build a collection with a collection expression. Required and init members make intended initialization visible to callers.",
    question: "What guarantees do the newer C# features actually offer?",
    walkthrough: "A switch expression with property patterns can select behavior from a message shape. A primary constructor makes parameters available to a type, but an ordinary class does not automatically publish them as properties. A collection expression is target typed. Required enforces initialization in supported construction contexts, while init limits ordinary assignments after initialization. Neither validates a supplied string’s content or guarantees deep immutability.",
    example: "A command with required string Name can still be initialized with an empty string. If whitespace is invalid, enforce that domain rule where the command is accepted or the validated domain value is created.",
    implications: "Keep runtime validation for invalid combinations and deserialized input. Concise syntax helps when readers can still identify ownership, defaults and the lifetime of constructor parameters."
  },
  "clr-runtime-gc__clr-the-managed-execution-model": {
    overview: "The CLR loads assemblies and supplies execution services such as type checks, exception handling and garbage collection. Managed objects remain alive while reachable through roots known to the runtime.",
    question: "What services does managed execution supply at runtime?",
    walkthrough: "When loading code, the runtime resolves types and metadata, prepares methods for execution and tracks managed references so the collector can identify live objects. An executing thread’s locals, static fields and runtime handles can form roots. Code that interoperates with native APIs must still respect calling conventions and native ownership. A managed wrapper remaining reachable can keep its native allocation alive.",
    example: "A memory graph shows a small image wrapper retained by a static cache while process memory grows by megabytes per image. Check native allocations and disposal in addition to the managed heap snapshot.",
    implications: "Managed execution still permits native interoperation. Crossing that boundary introduces explicit responsibilities for handle ownership, memory layout and lifetime."
  },
  "clr-runtime-gc__c-il-jit-native": {
    overview: "A normal managed build emits IL plus metadata. At execution the runtime can compile a method to native instructions for the machine running it, usually when the method is first needed.",
    question: "What changes between compiling a program and executing it?",
    walkthrough: "The C# compiler checks language rules and emits IL and metadata into an assembly. In a typical JIT deployment the runtime then loads that assembly and compiles needed methods for the current architecture. Generic specialization, inlining and CPU capabilities can affect native code generation. Measuring only the first invocation mixes loading, static initialization, JIT work and the method’s actual logic.",
    example: "Run a trivial endpoint immediately after process start and again under a warmed steady workload. Report both latencies if the service scales from zero. Improving the second measurement alone might never improve the first request.",
    implications: "Separate first-call latency from steady-state performance when measuring an endpoint. A benchmark that times only one call may mostly measure startup and compilation."
  },
  "clr-runtime-gc__tiered-compilation": {
    overview: "A runtime can compile a method quickly to get the process serving, then spend more optimization effort on frequently executed methods. Different invocations can therefore run different native versions.",
    question: "Why can a benchmark change performance halfway through?",
    walkthrough: "A frequently called method can transition from an initial implementation to optimized native code as the runtime gathers evidence that compilation cost is worthwhile. Inlining decisions and loop behavior can change between tiers. Different runtime settings and deployment modes influence which transitions occur. Warmup should approximate the code paths, branch distribution and method lifetimes seen in the deployment under evaluation.",
    example: "Graph latency against invocation number rather than reporting only a single average. A step change after many calls suggests a warmup effect worth separating from allocation growth or external dependency latency.",
    implications: "Measure cold and warmed behavior separately. Short-lived workers and long-running services may favor different choices because they spend different fractions of their lives warming up."
  },
  "clr-runtime-gc__profile-guided-optimization-pgo": {
    overview: "A generic serialization path may receive one concrete type nearly all the time. Runtime profiles can help the compiler optimize the common case while retaining a correct fallback for others.",
    question: "How can observed types improve an interface call?",
    walkthrough: "A virtual or interface call may have several legal targets. If profiling shows one concrete implementation dominates, optimized code can guard for that type and call or inline it directly on the common path, with a general dispatch path for other types. The improvement depends on observed behavior and generated code. Changing production traffic mix can change the benefit.",
    example: "Benchmark the same serializer with 95% one model type and with an even mix of ten. Compare steady-state throughput and branch behavior before attributing all improvement to the source-level interface design.",
    implications: "Benchmark with realistic type and branch distributions. An artificial workload with a single dominant type can exaggerate the benefit seen with mixed production traffic."
  },
  "clr-runtime-gc__native-aot-vs-readytorun-vs-jit": {
    overview: "JIT compilation adapts code at runtime. ReadyToRun ships precompiled code while retaining runtime compilation capabilities. Native AOT produces a native executable ahead of time and constrains some dynamic features.",
    question: "What decisions move from deployment time to build time?",
    walkthrough: "Native AOT performs ahead-of-time compilation and restricts scenarios requiring dynamic code generation. ReadyToRun adds precompiled native code to a managed deployment but some methods can still be JIT-compiled or reoptimized. JIT-only deployment does more discovery and compilation at runtime. These choices influence cold start, binary size, portability across targets and how reflection-heavy dependencies behave.",
    example: "For an autoscaled API, measure process start to first successful request, memory at steady load and throughput after warmup. Exercise the real serializer and DI setup in the published binary before comparing numbers.",
    implications: "Compare cold start, package size, throughput after warmup and library compatibility for the actual service. A short-lived command and a permanently warm API may benefit from different builds."
  },
  "clr-runtime-gc__trimming-its-hazards": {
    overview: "A trimmer removes code it cannot see being used. A serializer that discovers properties from names supplied at runtime can depend on members with no obvious static caller.",
    question: "How do you preserve code discovered only at runtime?",
    walkthrough: "A linker can follow a direct constructor call. It may be unable to infer which constructor the application will request from a type name read from configuration. Prefer generated registries for a known set of types. Where dynamic discovery is intentional, communicate the required members using appropriate annotations and review resulting warnings. Broadly preserving whole assemblies can eliminate much of trimming’s size benefit.",
    example: "Publish a trimmed artifact and load a handler referenced only by configuration. A normal debug test that directly instantiates that handler may unintentionally root the type and hide the deployment failure.",
    implications: "Publish the trimmed build in CI and exercise reflection-heavy paths. Prefer explicit contracts or generated metadata and use targeted annotations when dynamic discovery is essential."
  },
  "clr-runtime-gc__server-vs-workstation-gc-background-mode": {
    overview: "Server GC favors throughput with multiple heaps and parallel collection work. Workstation GC has different resource trade-offs. Background collection can overlap much of a generation-two collection with managed execution.",
    question: "Which measurements separate collector choice from an allocation problem?",
    walkthrough: "Look at allocation bytes per request, survival, collection pause distribution, heap size, CPU limit and throughput together. Server heaps and dedicated GC work can improve throughput on a busy multiprocessor service, while memory-constrained deployments may pay a higher footprint. Background collection allows much of older-generation work to overlap with application threads. Young-generation collections and synchronization pauses still affect latency.",
    example: "Run the same load in containers with the production CPU and memory quotas. Compare p99 request latency and successful requests per CPU second as well as total time spent in GC.",
    implications: "Measure allocation rate, pause percentiles, memory limits and CPU contention in the real container. Background GC still needs pauses, and more GC parallelism consumes resources other workloads may need."
  },
  "clr-runtime-gc__the-generational-garbage-collector": {
    overview: "Most temporary objects die quickly. The collector can reclaim short-lived objects in young generations frequently while visiting longer-lived objects less often. Survivors may be promoted as collections occur.",
    question: "Why does promotion change the cost of retained objects?",
    walkthrough: "A young-generation collection can inspect young allocations without rescanning the entire old heap. Runtime write barriers and remembered references help it find pointers from older objects into younger ones. Objects surviving collections may move into older generations collected less frequently. A long-lived queue retaining batches can keep otherwise temporary objects alive long enough to increase old-generation work.",
    example: "At 1,000 requests/s, holding each 50 KB payload for ten extra seconds retains about 500 MB before object overhead. Reducing queue delay may help more than changing GC configuration.",
    implications: "A queue retaining request objects for minutes turns short-lived allocations into long-lived ones. Look for why objects survive before tuning collection frequency."
  },
  "clr-runtime-gc__large-object-heap-fragmentation": {
    overview: "Large arrays usually land on the large object heap. Repeatedly allocating and dropping different sizes can leave free regions that are hard to reuse for the next large allocation.",
    question: "What evidence identifies large-object fragmentation?",
    walkthrough: "A process can have plenty of total free heap space but lack a sufficiently large contiguous region for a new array in the relevant segment. Compare allocation sizes, live large-object volume and free-space distribution. Large arrays commonly enter the LOH at around 85,000 bytes under default settings. Collection generally accompanies generation-two collections, and compaction behavior differs from ordinary small-object allocation.",
    example: "A service alternates 100 KB and 2 MB buffers, briefly retaining some large buffers. Measure churn and fragmentation first, then compare bounded pooling or chunked processing with the same maximum concurrent requests.",
    implications: "Reuse bounded buffers or process data in chunks when profiling shows pressure. A pool that retains every peak-sized buffer can trade allocation churn for a permanently larger working set."
  },
  "clr-runtime-gc__gc-generations-loh-how-managed-memory-leaks-happen": {
    overview: "A growing static dictionary keeps objects reachable, so even a full collection cannot reclaim them. Large retained payloads may accumulate on the large object heap while their small wrappers sit elsewhere.",
    question: "How do you distinguish a memory leak from a high-water mark?",
    walkthrough: "Take comparable snapshots after similar load and collection conditions. If live object counts keep growing, find an object retained longer than intended and trace its path to a root. Common roots include static dictionaries, event publishers and timers. If live objects stabilize while process memory remains high, investigate heap reservations, native allocations and pools. A single process working-set graph does not distinguish those cases.",
    example: "A singleton publisher retains 10,000 closed views through event delegates. Verify that unsubscribing lets views become unreachable and that the live count stabilizes after repeated open-close cycles.",
    implications: "Compare heap snapshots and inspect paths to roots. Distinguish reachable growth from temporarily reserved heap space before calling an increase in process memory a leak."
  },
  "clr-runtime-gc__finalizers-vs-dispose-when-you-need-a-finalizer": {
    overview: "Dispose gives callers a way to release an owned resource at a known point. A finalizer runs later at runtime discretion and adds lifetime and collection costs.",
    question: "Why use SafeHandle for native ownership?",
    walkthrough: "A finalizable object can require extra collection cycles because the runtime must arrange finalization before reclaiming it. Finalization timing and ordering are unsuitable for ordinary resource management. SafeHandle centralizes reliable release of a native handle, allowing the containing class to dispose it deterministically. A type with its own finalizer needs a carefully idempotent cleanup path so explicit disposal and finalization cannot double-release.",
    example: "Wrap one handle, dispose the wrapper twice and confirm the native close occurs once. Also test construction failure partway through acquiring multiple resources so earlier acquisitions are released.",
    implications: "Wrap native handles in SafeHandle when possible. A class that only owns other disposable managed objects generally needs to dispose them and can rely on their own native cleanup machinery."
  },
  "clr-runtime-gc__managed-vs-unmanaged-code-where-dispose-fits": {
    overview: "A database connection is a managed object that owns scarce external resources. The garbage collector traces references but cannot infer when the application has finished the transaction or should return a connection to the pool.",
    question: "What is the difference between reclaiming memory and releasing capacity?",
    walkthrough: "When an object becomes unreachable, GC can eventually reclaim its managed storage. The external system may have a much tighter lifetime requirement. An undrained reader can occupy a pooled connection; a file handle can prevent another process from replacing a file. Put using scopes around actual ownership intervals and avoid holding scarce resources during unrelated external calls.",
    example: "Acquire a database connection, fetch a bounded result and release it before spending two seconds calling another service. At 100 concurrent requests, that small change can return up to 100 connection slots sooner.",
    implications: "Make ownership explicit at API boundaries and dispose promptly. A process can exhaust its connection pool while using very little managed memory."
  },
  "clr-runtime-gc__reflection-cost-how-to-reduce-it": {
    overview: "Looking up members and invoking them reflectively on every row multiplies discovery overhead across the dataset. Discover the shape once and cache a suitable accessor when that work is on the hot path.",
    question: "Where does reflection overhead come from?",
    walkthrough: "Discovering members by string, constructing argument arrays, boxing value types and dynamically dispatching calls each have separate costs. Cache immutable metadata if repeated lookup dominates. For a stable signature, create a typed delegate once and call that delegate on each row. Account for setup cost and cache lifetime, especially when types belong to collectible assembly contexts.",
    example: "For 100 rows a cached PropertyInfo may be enough. For ten million conversions, benchmark direct access, cached reflective invocation and a prebuilt delegate, including first-use latency and bytes allocated per row.",
    implications: "Measure lookup and invocation separately. Bound a cache keyed by dynamically loaded types or it can keep plugins alive after their intended unload."
  },
  "clr-runtime-gc__source-generators-vs-reflection": {
    overview: "A source generator can emit serialization code for known models during compilation. The running program directly calls generated code, which exposes dependencies to trimming and avoids repeated runtime discovery.",
    question: "What gets generated, and what still happens at runtime?",
    walkthrough: "A source generator examines the compilation and adds ordinary source to the build. For a known DTO it can emit property access and metadata code the compiler and trimmer can see. The application still parses input, checks types and allocates its result at runtime. The performance benefit depends on which reflective discovery and invocation costs were removed and how frequently those costs occurred.",
    example: "Add an optional property to a DTO, regenerate, inspect a serialization round trip and publish the trimmed application. Verify behavior for an unknown plugin model separately because a compile-time registry cannot anticipate it.",
    implications: "Reflection remains valuable for genuinely unknown plugin types. Consider startup cost, binary size, diagnostic quality and how a new model enters the build."
  },
  "clr-runtime-gc__assemblies-assemblyloadcontext-plugins-unload": {
    overview: "A plugin load context can resolve its own dependency versions. Two assemblies with similar names loaded in different contexts can create distinct type identities, so share contract types deliberately.",
    question: "Why can an apparently unloaded plugin remain alive?",
    walkthrough: "A collectible AssemblyLoadContext can begin unloading when asked, but its assemblies and objects remain reachable if the host retains a type, delegate or running thread from that context. Keep the shared interface assembly in a common context so the host can cast plugin objects correctly. Dispose subscriptions, stop work, clear caches and drop strong references before checking whether collection completes.",
    example: "Load a plugin, subscribe its handler to a host event, then request unload. A weak reference to its context remaining live can lead you back to the host event subscription. Repeat after explicit cleanup.",
    implications: "Unloading a collectible context requires releasing external references. A host event subscription or cached delegate can keep the entire plugin reachable."
  },
  "collections-linq__list-vs-array-the-resizing-cost": {
    overview: "An array has fixed length. A List keeps a backing array with spare capacity so most appends are cheap. A resize allocates another array and copies existing elements.",
    question: "How expensive is growing a list in practice?",
    walkthrough: "A list tracks Count separately from Capacity. An append within capacity writes into the existing array. When full, it allocates a larger array and copies the previous elements. Geometric growth makes average append cost amortized constant, but an individual resize is linear and can create both latency and temporary memory pressure. Removing elements usually does not return the backing array automatically.",
    example: "A list loaded with 500,000 records and then cleared can retain a large array. Decide whether that capacity is useful for reuse or whether dropping the list better matches the lifetime of the batch.",
    implications: "Set initial capacity when input size is known and large. Avoid reserving the maximum imaginable size for every small request since unused capacity also consumes memory."
  },
  "collections-linq__big-o-of-the-common-net-collections": {
    overview: "Indexing an array is constant time, scanning a list is linear, and dictionary lookup is typically constant time with suitable hashes. Maintaining a balanced ordered tree costs logarithmic work per lookup or insert.",
    question: "Which complexity matters for this workload?",
    walkthrough: "Count lookups, inserts, removals and full scans independently. Array indexing is O(1), but inserting near its beginning shifts elements. A dictionary offers expected O(1) key lookup, with hashing and collision costs. A balanced search tree supports O(log n) lookup and ordered traversal. Big-O omits locality, allocation and input size, so it narrows the shortlist before measurement.",
    example: "For five IDs tested once, building a hash table adds setup work. For 100,000 membership tests against the same thousand IDs, paying setup once can eliminate millions of comparisons.",
    implications: "Include operation mix and constants. Iterating a compact array can beat maintaining a hash table for a handful of values tested only once."
  },
  "collections-linq__dictionary-hashing-collision-handling": {
    overview: "A dictionary hashes a key to locate candidate entries and compares keys to resolve collisions. Poor hash distribution increases comparisons and can erase expected lookup performance.",
    question: "What happens when two keys hash to the same bucket?",
    walkthrough: "A dictionary uses the hash to narrow the candidate set and an equality comparer to distinguish keys. Collisions are expected and do not overwrite distinct keys. Long collision chains increase comparison work, while growing the backing storage can require repositioning entries. A mutable key that changes its hash after insertion may become unreachable from the bucket where the next lookup starts.",
    example: "Insert customer A and B under a test comparer returning a constant hash. Both should remain retrievable, though the lookup work grows with the number of entries. This isolates correctness from performance.",
    implications: "Use a comparer consistent with equality, especially for case-insensitive strings. A resize can redistribute entries, so account for capacity when ingesting a known large dataset."
  },
  "collections-linq__hashset-vs-list-for-membership-set-operations": {
    overview: "If reconciliation repeatedly asks whether an invoice ID appeared yesterday, build a HashSet once and query membership. Intersect and Except can then express overlap or missing IDs directly.",
    question: "What if the inputs have duplicates?",
    walkthrough: "A HashSet models membership. Except yields distinct elements from the first sequence absent from the second; it does not perform quantity reconciliation. For repeated tests, choose a comparer once and construct the set before entering the loop. When duplicate counts matter, use a dictionary from key to count, then decrement or compare those counts during reconciliation.",
    example: "Yesterday’s IDs [7, 7, 8] and today’s [7, 8] produce identical sets. If the second 7 represents an extra bill, a set comparison will miss the discrepancy.",
    implications: "A set discards duplicates. Preserve counts separately when two occurrences mean two charges, and choose equality rules that match the business identifier."
  },
  "collections-linq__sorteddictionary-vs-sortedlist-vs-dictionary": {
    overview: "Dictionary suits frequent unordered lookups. SortedDictionary maintains sorted keys in a tree. SortedList uses compact ordered arrays, making lookup efficient while middle inserts can shift many entries.",
    question: "How does sorted storage change update cost?",
    walkthrough: "SortedList stores keys and values in ordered arrays. Binary search finds a position efficiently, but inserting near the beginning shifts later entries. A balanced tree avoids those array shifts while spending extra memory on its nodes. A hash dictionary sacrifices ordered key traversal for fast point lookups. Sorting at output time can be cheaper than paying for order on every update.",
    example: "For a routing table built once and scanned by key on every report, benchmark compact sorted storage. For randomly inserted scheduling boundaries that must remain sorted all day, measure tree insertion cost and traversal locality.",
    implications: "For a read-mostly price table loaded once, compact sorted storage can work well. For frequent ordered insertions, compare a tree using production-sized inputs."
  },
  "collections-linq__priorityqueue-what-when": {
    overview: "A scheduler repeatedly needs the earliest deadline among many queued jobs. A priority queue maintains a heap so it can remove the next job without sorting the entire backlog on every poll.",
    question: "Why is peeking cheap while removing the minimum takes work?",
    walkthrough: "A min-heap maintains a local ordering property between each parent and its children. The root therefore holds a minimum. Removing it replaces the root with another entry and restores the property by moving that entry downward. Enqueue similarly moves an entry upward as needed. The heap does not fully sort siblings, which is why enumerating its backing items cannot produce sorted output.",
    example: "Enqueue tasks with priorities 5, 1 and 3. Peek gives priority 1. If two tasks share priority 1 and arrival order is part of the contract, use a composite priority containing a sequence number.",
    implications: "Define how to break ties when arrival order matters. Equal priorities alone do not guarantee FIFO behavior, and inspecting a heap’s storage does not yield a fully sorted sequence."
  },
  "collections-linq__the-concurrent-collections-which-when": {
    overview: "Use ConcurrentQueue for FIFO handoff, ConcurrentStack for LIFO, ConcurrentBag when order is irrelevant, and ConcurrentDictionary for coordinated per-key operations. Each protects its own documented operations.",
    question: "When does a thread-safe method still permit a race?",
    walkthrough: "A concurrent collection can synchronize TryDequeue or TryAdd. A Count check followed by a separate dequeue leaves time for another thread to remove the last item. Express the decision through the method that makes the change and inspect its result. For invariants spanning independent keys or collections, define a single coordination boundary around the entire transition.",
    example: "Two consumers observe Count = 1. Only one can successfully TryDequeue. Write the loop around the Boolean result and give the losing consumer a defined wait or exit path.",
    implications: "A safe collection cannot make a sequence of separate calls atomic. For asynchronous producers that need capacity limits, consider a bounded channel."
  },
  "collections-linq__concurrentdictionary-the-getoradd-factory-gotcha": {
    overview: "GetOrAdd may run several value factories for the same key under contention, even though only one resulting value is stored. A factory that sends a payment can therefore send it twice.",
    question: "Why can a factory run twice for one stored value?",
    walkthrough: "GetOrAdd may invoke user code outside internal locks so an expensive or reentrant factory cannot hold the map’s synchronization indefinitely. Competing threads can compute values before a winner publishes one. With Lazy<T>, several cheap wrappers can be allocated, but callers evaluate the wrapper returned by the dictionary. Decide how exceptions are cached and whether a failed initialization should be removed safely for retry.",
    example: "var lazy = cache.GetOrAdd(key, k => new Lazy<Result>(() => Load(k)));\nreturn lazy.Value;\nThis shares the winning wrapper inside this process. Separate service replicas still perform their own initialization.",
    implications: "Keep factories safe to repeat. When sharing expensive initialization, store a suitable Lazy value and define what to do if the shared initialization faults."
  },
  "collections-linq__immutable-frozen-collections": {
    overview: "Immutable collections produce a new logical version when changed and can share internal structure with the previous version. Frozen collections spend setup effort to optimize a fixed dataset for repeated lookup.",
    question: "How do snapshots behave when a writer publishes an update?",
    walkthrough: "An immutable dictionary returns a new root while sharing unchanged structure. A reader holding the old root can finish its traversal consistently, provided the stored values also have the required immutability. Publish a new root atomically and coordinate concurrent writers to avoid lost changes. Frozen collections target a different pattern: spend time constructing a lookup once and perform many reads with few or no rebuilds.",
    example: "If a permission snapshot contains mutable List<string> values, changing a list changes what old readers observe. Use immutable values as well as an immutable outer container when snapshot consistency matters.",
    implications: "Publish an immutable snapshot when readers must retain earlier versions. Freeze a routing table loaded at startup when measurements justify its construction cost."
  },
  "collections-linq__collection-interfaces-ienumerable-icollection-ilist-ireadonly": {
    overview: "IEnumerable promises enumeration. ICollection adds count and collection operations, while IList adds positional access. Read-only interfaces restrict the operations exposed through that reference.",
    question: "What can the caller infer from a collection interface?",
    walkthrough: "IEnumerable tells the consumer it may enumerate. It gives no promise of cheap count, random access, repeatability or finite size. IReadOnlyList adds indexing and count via a read-only surface, but the implementation may still change through a different reference. Document ordering and lifetime guarantees separately. An algorithm needing two indexed passes should request or construct a representation that really supports them.",
    example: "Passing an IEnumerable backed by live database reads into a helper that repeatedly calls ElementAt can execute repeated scans. Materialize a bounded input once or change the algorithm to a single traversal.",
    implications: "Accept the narrowest contract the algorithm really needs. A read-only view can still change through another owner, so take a snapshot when callers require stable results."
  },
  "collections-linq__using-a-custom-type-as-a-dictionary-key": {
    overview: "A dictionary key should carry stable identity. A readonly value representing tenant and order number is a safer composite key than a mutable order whose status participates in its hash.",
    question: "How should a composite key encode business identity?",
    walkthrough: "Decide which fields identify the value and how each field is compared. Tenant and invoice number may form the key, while status is mutable and irrelevant. A record struct can generate consistent equality for its fields, but string fields still follow their default equality semantics. Apply a custom comparer or canonicalization if business identifiers are case-insensitive, and define that rule consistently on storage boundaries.",
    example: "Test a separately constructed equivalent key, two equal invoice numbers in different tenants and case variants. Inserting under one value and retrieving under each expected equivalent catches more mistakes than testing Equals alone.",
    implications: "Define equality, hash calculation and any string normalization together. Test that separately constructed but equivalent keys retrieve the same entry."
  },
  "collections-linq__deferred-vs-immediate-execution": {
    overview: "A query that filters overdue invoices can observe changes to its input when enumerated later. Calling ToList now runs it and stores the resulting sequence at that moment.",
    question: "What does materializing a sequence actually freeze?",
    walkthrough: "Deferred operators retain a recipe and a reference to the source. Enumerating later runs the recipe against whatever that source yields then. ToList fixes the resulting membership and ordering at enumeration time. It usually copies references to objects, so later mutations to those objects can still be observed. A deep immutable snapshot requires explicit value projection or cloning as appropriate.",
    example: "Build a query over open orders, add a new open order, then enumerate. The new row appears. If you had called ToList before the insert, it would be absent, while editing an existing referenced order could still be visible.",
    implications: "Materializing trades memory for a repeatable sequence and a known execution point. For reference-type elements, the resulting list can still expose later changes to the objects themselves."
  },
  "collections-linq__the-multiple-enumeration-pitfall": {
    overview: "Calling Any and then looping over a query can enumerate it twice. With a database or network source, those enumerations may cost two requests and even return different results.",
    question: "How can an innocent validation check double the work?",
    walkthrough: "An API may accept a stream of rows and call Count to size a result, then iterate the rows to populate it. For a list, count is cheap. For a generator or database-backed sequence this may perform the expensive operation twice. Some streams are consumable only once. Choose a single-pass algorithm or require a collection that actually supplies the needed capability.",
    example: "Instrument a generator by incrementing a counter when enumeration starts. Call the helper with it and assert the expected number of enumerations. This catches hidden traversals inside validation or logging.",
    implications: "Use one pass when feasible. Materialize once if repeated access is necessary and size is bounded. Look for enumeration inside helper methods as well as at the immediate call site."
  },
  "collections-linq__ienumerable-vs-iqueryable-where-the-query-runs": {
    overview: "A filter composed on IQueryable becomes part of the provider’s query representation. After switching to IEnumerable, subsequent filters run as ordinary managed code while enumerating the upstream results.",
    question: "Where precisely is the database-to-client boundary?",
    walkthrough: "Queryable.Where receives an expression tree that a provider can translate. Enumerable.Where receives a delegate executed by the application. AsEnumerable changes how subsequent operators bind without itself immediately downloading the data. Enumeration later executes the upstream database portion and streams or buffers its rows into the client-side portion. Look at both the SQL and the number of rows read.",
    example: "db.Orders.Where(o => o.TenantId == tenant).AsEnumerable().Where(NeedsManualReview)\nThe tenant predicate can run in SQL. Manual review runs once per returned order in the application.",
    implications: "Put selective, translatable predicates before crossing the boundary. Inspect generated SQL and rows transferred to verify an apparently small result did not require downloading the whole table."
  },
  "collections-linq__ienumerable-vs-iqueryable-vs-iasyncenumerable": {
    overview: "IEnumerable pulls the next element synchronously. IQueryable describes work a provider may translate. IAsyncEnumerable lets each next element arrive asynchronously, which is useful when reads wait on I/O.",
    question: "Can a query be both server-filtered and asynchronously streamed?",
    walkthrough: "Build the translatable filters and projection while working with IQueryable, then enumerate the provider’s async stream. This can avoid materializing all rows while still doing selective work in the database. The consumer controls cadence, so a slow downstream writer may keep a reader and pooled connection open. Buffering a bounded page can release that connection earlier at a known memory cost.",
    example: "Export one million rows to a slow network client. Compare peak memory, connection hold time and cancellation latency for streaming the whole query versus streaming independently fetched keyset pages.",
    implications: "Decide separately where filtering happens and how results arrive. Streaming a database result can reduce memory while holding a connection for as long as the consumer reads."
  },
  "collections-linq__expression-trees-how-iqueryable-becomes-sql": {
    overview: "A lambda assigned to an expression tree describes operations as data. A query provider can inspect a comparison, turn it into a SQL predicate and bind the comparison value as a parameter.",
    question: "What does the provider see in a captured predicate?",
    walkthrough: "The expression tree represents parameter access, a member such as Total and a comparison against a captured value. The provider can translate recognized operations and bind values as SQL parameters. It cannot generally translate arbitrary compiled CLR code. Compiling the expression into a delegate removes the structure needed for server translation. Provider support also varies with operation and database.",
    example: "Expression<Func<Order, bool>> costly = o => o.Total >= threshold;\nInspect the SQL generated for Where(costly). Verify the threshold is bound as a parameter and the filter occurs before returning rows.",
    implications: "An arbitrary C# helper inside the tree may lack a translation. Inspect the SQL or translation error, then move only the necessary work across the database boundary."
  },
  "collections-linq__streaming-vs-buffering-operators": {
    overview: "Where and Select can produce a first result after seeing one matching element. OrderBy generally needs to see the entire input before it knows which element comes first.",
    question: "Does deferred execution always imply streaming?",
    walkthrough: "An operator can postpone all work until enumeration and still need the entire input before yielding its first element. In-memory GroupBy generally builds groups, while Where can emit each passing item immediately. Distinct can emit early but must remember previously seen keys. Ask separately about time to first result, total work and retained state. A database provider may choose different physical algorithms.",
    example: "Read a large file through Where and take its first matching row. Now place OrderBy between Where and First and inspect how much input must be examined to guarantee the smallest match.",
    implications: "Estimate peak memory and time to first item separately. A downstream Take does not automatically make an upstream in-memory sort cheap."
  },
  "collections-linq__groupby-join-selectmany-semantics-cost": {
    overview: "In LINQ to Objects, GroupBy gathers matching keys, Join builds a lookup over the inner input, and SelectMany flattens nested sequences. One order with ten lines becomes ten elements after flattening.",
    question: "How can a join change the meaning of an aggregate?",
    walkthrough: "A join pairs every matching item from one side with every matching item on the other. Two lines and three payments for one order can therefore produce six rows. Summing order-level amounts afterward multiplies the total. Group before joining or project separately when the intended grain is one row per order. SelectMany similarly changes the grain from parent to child.",
    example: "For order 42 with line amounts 5 and 7 and three payments, a joined sum of line amounts can become 36. Aggregate lines to 12 before combining with payment data.",
    implications: "Check output cardinality before summing money or paginating. Joining two nonunique keys can multiply rows even when both inputs look modest."
  },
  "collections-linq__query-syntax-vs-method-syntax": {
    overview: "Query syntax is translated into method calls such as Where, Select and SelectMany. A join written with query clauses can describe the same operations as its fluent equivalent.",
    question: "How do you translate a query clause by hand?",
    walkthrough: "A from introduces a range variable, where restricts it and select projects a new shape. A second from generally introduces SelectMany. Joins and groupings map to corresponding operators. Both syntaxes use the same underlying patterns, so inspect which methods bind and whether the source is queryable. The most readable form can differ for a multi-table join and a short projection.",
    example: "from o in orders where o.Paid select o.Id\norders.Where(o => o.Paid).Select(o => o.Id)\nWith the same source and overloads these describe the same filter and projection.",
    implications: "Choose the form that makes scope and cardinality clear. Measure the resulting operation or SQL because changing notation alone gives no performance guarantee."
  },
  "collections-linq__yield-iterator-mechanics": {
    overview: "A yield iterator preserves local state between MoveNext calls. Work pauses at the yielded element and resumes when the consumer asks for another. Each new enumeration typically starts its own traversal.",
    question: "Which parts of an iterator survive between calls?",
    walkthrough: "The compiler generates an enumerator with state for the current position and locals needed after a yield. MoveNext runs up to the next yield or completion. Current exposes the yielded element. Disposal must run applicable finally blocks even after early exit. Returning an enumerator backed by an already disposed resource violates the lifetime contract before any of that machinery can help.",
    example: "Step through a two-element iterator: create sequence → obtain enumerator → MoveNext yields A → caller stops → Dispose runs cleanup. Code after the last yield may never execute unless protected by finally.",
    implications: "A using scope inside the iterator spans those pauses. A foreach that exits early disposes its enumerator, allowing the iterator’s cleanup to run."
  },
  "collections-linq__the-closure-captured-variable-pitfall-in-loops": {
    overview: "A delegate created in a for loop can close over the same index variable as every other delegate. When the delegates run later, they read its then-current value.",
    question: "Why does adding a local change the result of delayed callbacks?",
    walkthrough: "A closure captures a variable, not its value at the instant the lambda is constructed. A for loop normally reuses the same index variable, so queued callbacks can all observe its final value. Declaring a fresh local in the loop body gives each callback a distinct captured variable. Modern C# foreach iteration variables have different capture behavior from a shared for-loop index.",
    example: "for (int i = 0; i < 3; i++) { int job = i; actions.Add(() => Run(job)); }\nInvoke actions after the loop. The job values are 0, 1 and 2 even though i has reached 3.",
    implications: "Capture a fresh local inside each iteration when each callback needs its own value. Capturing a reference still shares the underlying mutable object."
  },
  "collections-linq__common-linq-performance-pitfalls": {
    overview: "Filtering after materializing a full table, sorting to find a minimum, or repeatedly scanning a list inside another loop all hide substantial work behind short expressions.",
    question: "How do you estimate the cost of a LINQ expression?",
    walkthrough: "Translate the pipeline into passes and data structures. Filtering n orders with list.Contains against m selected IDs can take O(n × m) comparisons. Constructing a HashSet of IDs first costs O(m) expected work and makes the membership phase approximately O(n). For IQueryable, the corresponding SQL and indexes determine the actual cost, so do not infer a database plan from LINQ-to-Objects behavior.",
    example: "At 50,000 orders and 2,000 selected IDs, a nested linear lookup can approach 100 million comparisons. Test with realistic sizes and inspect allocated bytes as well as wall time.",
    implications: "Identify source size, enumeration count and where materialization happens. Move selective work to the provider and use an appropriate lookup structure for repeated membership tests."
  },
  "collections-linq__delegates-func-action-predicate-powering-linq": {
    overview: "Where accepts a function from an element to bool, and Select accepts a function from input to output. Action represents work with no return value. Predicate expresses a boolean test but is a distinct delegate type.",
    question: "How does passing behavior affect correctness?",
    walkthrough: "Func<T,bool> describes a test and Func<T,U> describes a mapping. The caller supplies behavior while the operator controls when and how often to invoke it. Predicate<T> has a compatible-looking signature but remains a distinct delegate type. With deferred evaluation, burying required writes in a selector ties business effects to how much of a sequence happens to be consumed.",
    example: "If Select both sends a message and returns its ID, Take(1) sends at most one message. Enumerating the full query twice can send every message twice. Keep required writes in an explicit workflow.",
    implications: "Keep transformations free of essential side effects. A deferred query can invoke the delegate zero times, once or repeatedly depending on how it is enumerated."
  },
  "async-multithreading-resilience__task-vs-valuetask-why-valuetask-exists": {
    overview: "ValueTask can return a synchronously available value without allocating a new Task on a hot path. Its representation also permits a reusable completion source with stricter consumption rules.",
    question: "When does a ValueTask optimization pay for itself?",
    walkthrough: "Measure the synchronous completion rate and allocation cost of the Task alternative. A cached read that usually completes immediately may benefit from returning a value directly. A ValueTask is a larger value type and can be backed by a reusable source whose result must be consumed according to its contract. Passing it through many layers or repeatedly converting it to Task may erase the advantage.",
    example: "Benchmark 95% cache hits and 5% genuinely asynchronous misses. Also benchmark the actual caller if it collects operations into WhenAll, since conversion and composition costs occur outside the method returning ValueTask.",
    implications: "Prefer Task for ordinary APIs. Consume a ValueTask once unless its contract permits more. Convert it to a Task once when callers need repeated awaiting or task combinators."
  },
  "async-multithreading-resilience__async-await-under-the-hood-state-machine": {
    overview: "An async method runs synchronously until it encounters an incomplete await. The generated state machine records what is needed to resume and registers a continuation. Waiting for I/O need not occupy a worker thread.",
    question: "Who runs the continuation after an await?",
    walkthrough: "The awaiter checks whether the operation is already complete. If so, execution can continue synchronously. Otherwise the state machine records its position, arranges a continuation and returns a task to the caller. When the operation completes, scheduling depends on the awaiter and captured context or scheduler. There is no general guarantee of a new thread or of returning to the same thread.",
    example: "Log before and after awaiting a completed task and then a delayed I/O task. Compare thread identity and completion timing, but avoid treating either observed identity as part of the API contract.",
    implications: "Code before the first incomplete await still consumes the caller’s thread. Marking a CPU-heavy method async does not move that computation elsewhere."
  },
  "async-multithreading-resilience__task-whenall-vs-whenany-vs-parallel-foreachasync": {
    overview: "WhenAll waits for all supplied tasks. WhenAny returns the task that finished first and leaves the rest running. Parallel.ForEachAsync can bound how many asynchronous iterations are in flight.",
    question: "Which combinator actually limits concurrency?",
    walkthrough: "WhenAll combines tasks already supplied to it. Building ten thousand tasks that start HTTP requests before passing them to WhenAll may overwhelm a dependency. WhenAny reports a completed task and leaves cancellation policy to the caller. Parallel.ForEachAsync can regulate iteration concurrency when configured. Match the limit to downstream capacity and include the whole fleet when choosing it.",
    example: "If a provider permits 100 in-flight calls and ten replicas normally share the load, twenty concurrent calls per replica can already exceed the intended global budget by a factor of two.",
    implications: "For a thousand downstream calls, choose a concurrency limit based on downstream capacity. Await the task returned by WhenAny to observe its result, and explicitly handle the remaining tasks."
  },
  "async-multithreading-resilience__whenall-with-exceptions-aggregateexception": {
    overview: "If three concurrent requests fail, the task returned by WhenAll records the collected failures. Awaiting it typically throws one of them, so logging only the caught exception can hide other causes.",
    question: "What if some tasks cancel and others fault?",
    walkthrough: "WhenAll completes after all supplied tasks have finished. If any fault, the combined task is faulted. If none fault but at least one is cancelled, it is cancelled. Awaiting and inspecting the aggregate task are two ways to observe different detail about the same outcome. For partial results, track individual tasks and their request identities instead of treating the combined failure as the only result.",
    example: "Fan out to A, B and C. A succeeds, B times out with cancellation and C throws. Inspect C’s fault and B’s cancellation separately while retaining A’s data if the business contract permits partial success.",
    implications: "Keep a reference to the combined task and inspect its Exception after failure when all errors matter. Track which original request each failure belonged to."
  },
  "async-multithreading-resilience__lock-vs-interlocked-vs-concurrentdictionary": {
    overview: "Interlocked can atomically increment a single counter. A lock can protect an invariant spanning several fields. ConcurrentDictionary supplies atomic per-key operations with its own synchronization.",
    question: "How do you identify the smallest correct synchronization boundary?",
    walkthrough: "Write down the invariant an observer must never see broken. An individual completed-request count can use Interlocked.Increment. Updating both count and total duration for an exact snapshot may require a common lock around writers and readers. A concurrent dictionary can coordinate per-key insertion, but a separate list recording insertion order would be another structure with its own race.",
    example: "If readers calculate an exact average from sum and count, two independent atomic reads can observe different logical moments. Either take one synchronized snapshot or document that the metric is approximate.",
    implications: "Start with the invariant. Transferring an amount between accounts requires coordinated updates to two balances. Two individually atomic increments alone cannot give observers a consistent transfer."
  },
  "async-multithreading-resilience__volatile-interlocked-memory-barriers": {
    overview: "A volatile read or write constrains memory ordering and visibility, but incrementing a variable involves a read, calculation and write. Concurrent increments can therefore still be lost.",
    question: "Why does volatile fail to make a counter safe?",
    walkthrough: "Suppose two threads read the same volatile count of 4, compute 5 and each store 5. Visibility rules can be fully respected and an increment still disappears. Atomic read-modify-write ties those operations together. Memory ordering also matters when publishing initialized data to another thread. Use proven primitives for publication instead of relying on processor behavior observed in one stress run.",
    example: "For a shared counter, Interlocked.Increment(ref count) changes the value as one operation. For “replace configuration if its version is still V,” use an atomic compare-and-swap or a lock around comparison and publication.",
    implications: "Use Interlocked for atomic read-modify-write operations. Use a lock for multi-field state unless you can justify and verify a more specialized publication protocol."
  },
  "async-multithreading-resilience__async-await-causing-threadpool-starvation-diagnose": {
    overview: "Requests that block on incomplete tasks occupy pool workers while their continuations also need workers. Under load the queue grows, response latency rises and CPU can remain surprisingly low.",
    question: "What observations distinguish starvation from CPU saturation?",
    walkthrough: "With starvation, many pool workers are blocked and runnable continuations queue behind them. Worker count may increase while CPU remains below capacity. With CPU saturation, runnable work competes for actual execution time and CPU approaches its quota. Capture counters and stacks during the affected window. Typical synchronous waits include Task.Result, Wait and blocking I/O inside hot request handlers.",
    example: "A slow dependency lengthens waits from 20 ms to 2 s. At a constant 100 requests/s, roughly 200 concurrent waits can accumulate. Truly asynchronous waits avoid tying up one worker per outstanding request.",
    implications: "Inspect worker counts, queued work and stacks for synchronous waits. Remove blocking along the request path and bound expensive dependencies before tuning thread-pool minimums."
  },
  "async-multithreading-resilience__configureawait-false-the-sync-over-async-deadlock": {
    overview: "On a single-threaded UI context, a synchronous wait can hold the only thread allowed to run the awaited continuation. ConfigureAwait(false) allows the continuation to proceed without returning to that captured context.",
    question: "Which two conditions are necessary for the classic UI deadlock?",
    walkthrough: "The UI thread must synchronously block waiting for a task, and task completion must require work scheduled to that same thread. If the awaited task already completed synchronously, the deadlock may disappear in tests. ConfigureAwait(false) affects the continuation at that await only. Even without a synchronization context, blocking still occupies workers and can degrade throughput.",
    example: "UI thread calls LoadAsync().Result. LoadAsync awaits I/O and schedules its continuation back to the UI. The queued continuation cannot run until Result returns. Make the UI event path asynchronous through the wait.",
    implications: "Prefer awaiting through the call stack. One ConfigureAwait in a caller cannot repair a dependency that already captured the blocked context. ASP.NET Core commonly exhibits blocking-induced starvation instead."
  },
  "async-multithreading-resilience__cancellationtoken-linking-timeouts-propagation": {
    overview: "A request can end because the client disconnected, the service is stopping or a deadline elapsed. Link those cancellation sources and pass the resulting token into downstream operations.",
    question: "How should cancellation interact with the commit boundary?",
    walkthrough: "Propagate cancellation to reads and computations that are safe to abandon. Before committing a multi-step operation, decide whether cancellation can still leave a coherent result. After a durable commit, an aborted HTTP response does not undo the change. Preserve an operation ID so a client can find out what happened. Distinguish a caller cancellation from an internal deadline when reporting failures.",
    example: "A token fires after SQL commits but before the confirmation response is written. A retry under the original order ID should retrieve the existing order, even if the first HTTP request ended as cancelled.",
    implications: "Cancellation is cooperative. Check it at safe boundaries, dispose linked sources, and decide what response is truthful if cancellation arrives after an irreversible commit."
  },
  "async-multithreading-resilience__limit-concurrent-external-calls-to-n-semaphoreslim": {
    overview: "A semaphore with ten permits can cap outstanding requests to a fragile dependency. Await a permit before starting work and release it in finally after successful acquisition.",
    question: "How do you avoid leaking a semaphore permit?",
    walkthrough: "Acquire asynchronously with the request token before entering the protected work. Release in a finally that surrounds only successfully acquired permits. If a timed wait reports false, no permit was obtained. Separately bound the wait queue or enforce request deadlines, since a semaphore caps active work but does not by itself prevent unlimited waiting tasks.",
    example: "await gate.WaitAsync(ct);\ntry { return await client.FetchAsync(id, ct); }\nfinally { gate.Release(); }\nChoose the lifetime of gate to match the dependency being protected.",
    implications: "Share the limiter at the scope being protected. Ten permits per request or per service instance can still overwhelm a dependency receiving traffic from many requests or replicas."
  },
  "async-multithreading-resilience__system-threading-channels-producer-consumer-backpressure": {
    overview: "A bounded channel decouples producers from consumers while limiting queued items. In wait mode, a full channel makes asynchronous writers wait until readers free capacity.",
    question: "What completion behavior does a bounded channel provide?",
    walkthrough: "A writer in wait mode suspends when the buffer has no space and a reader frees capacity by consuming items. Completing the writer stops admission and readers can drain already queued values. Choose how worker exceptions reach the producer and how cancellation interrupts a writer waiting on a permanently failed consumer. A graceful application shutdown requires an explicit drain deadline.",
    example: "Capacity 100, producers 300/s, consumer 200/s. Starting empty, the channel fills in roughly one second. After that, wait mode moves the pressure to producers, while a dropping mode intentionally changes delivery semantics.",
    implications: "Choose whether waiting or dropping is acceptable and expose that policy. Complete the writer at shutdown and drain or cancel readers deliberately. In-memory channels lose pending work on process failure."
  },
  "async-multithreading-resilience__iasyncenumerable-streaming-cancellation": {
    overview: "An async iterator can send the first page of results while later pages are still being fetched. Consumers use await foreach and can stop without needing the complete dataset in memory.",
    question: "Where does cancellation have to travel for streaming to stop?",
    walkthrough: "A client stopping enumeration should cause the iterator to dispose its enumerator and release readers or sockets. In an async iterator that takes a token, EnumeratorCancellation can connect the enumeration token to that parameter. The iterator must still pass the token to actual I/O. Checking cancellation only after reading a whole slow page can delay resource release substantially.",
    example: "Cancel a download after five rows of a million-row export. Verify the server stops querying, the response stops writing and the database connection returns to its pool within the expected time.",
    implications: "Propagate enumeration cancellation to actual reads and dispose the enumerator. Slow consumers may hold database connections, so include consumer speed in capacity estimates."
  },
  "async-multithreading-resilience__deadlock-causes-prevention-coffman-conditions": {
    overview: "Worker A holds the account lock and waits for the ledger lock while B holds the ledger lock and waits for the account. Exclusive access, hold-and-wait, no forced release and a cycle permit deadlock.",
    question: "How does a fixed acquisition order prevent a cycle?",
    walkthrough: "Assign each account a stable ordering key and acquire the lower key before the higher key on every transfer. Two transfers involving the same accounts may wait, but neither can hold the higher key while waiting for the lower. All code paths using the resources must honor the ordering. Another approach is to avoid holding one resource while waiting for another altogether.",
    example: "A→B and B→A transfers both lock account 3 before account 9. If one path also acquires a ledger lock, incorporate that lock into the global order or the cycle can reappear through a third resource.",
    implications: "Break the cycle with a common acquisition order. Timeouts can bound waiting, but retrying without changing ordering can recreate the same collision."
  },
  "async-multithreading-resilience__race-vs-deadlock-vs-livelock-vs-starvation": {
    overview: "A race changes the result depending on timing. Deadlocked participants cannot advance. Livelocked participants keep reacting to each other without completing. Starvation leaves one participant waiting while others make progress.",
    question: "How would you debug four superficially similar hangs?",
    walkthrough: "For a race, record conflicting accesses and test an invariant under forced interleavings. For deadlock, inspect a wait-for graph. For livelock, look for repeated retries or state changes with no completed work. For starvation, break down progress per participant and inspect scheduling or resource fairness. System-wide throughput can appear healthy while one low-priority queue receives no service.",
    example: "Two workers repeatedly release their resources to “be polite” and immediately collide again. CPU stays active and neither commits. Changing lock ordering or introducing randomized contention management addresses this livelock pattern.",
    implications: "Look for completed work per participant alongside CPU and queue depth. Busy workers with zero completions call for a different investigation than threads parked on a lock cycle."
  },
  "async-multithreading-resilience__when-parallelism-makes-things-slower": {
    overview: "Splitting a tiny computation across workers adds scheduling, synchronization and cache costs. If all workers contend for one shared counter, adding cores may increase waiting more than useful work.",
    question: "How do you estimate the theoretical speedup?",
    walkthrough: "If 20% of the work is inherently serial, even infinitely fast parallel execution of the remainder caps ideal speedup at five. With four workers the ideal time fraction is 0.2 + 0.8/4 = 0.4, before scheduling, cache misses or synchronization. Measure those overheads and account for competing requests already using the same cores. Parallelizing each individual request can reduce aggregate throughput.",
    example: "Compare one large batch at idle with many batches arriving concurrently. The first test measures a single caller’s completion time. The second exposes contention and the effect on other users.",
    implications: "Benchmark realistic batches including setup and merging. Use local accumulation where possible and compare throughput and tail latency under the actual CPU quota."
  },
  "async-multithreading-resilience__retry-vs-timeout-vs-circuit-breaker": {
    overview: "A timeout bounds the caller’s wait, a retry gives a transient operation another chance, and a circuit breaker temporarily rejects calls to a persistently unhealthy dependency.",
    question: "How do the policies compose across a call chain?",
    walkthrough: "An overall timeout bounds the full business operation. A shorter attempt timeout leaves room for retry delays and subsequent attempts. A breaker tracks dependency failures and, when open, avoids sending more doomed calls until a limited probe is allowed. Set policy order intentionally so you know whether the breaker counts each attempt or each exhausted logical request. A timeout may abandon the wait while the server continues working.",
    example: "With a 600 ms deadline, three 300 ms attempts plus backoff cannot fit. Allocate a smaller attempt budget or stop earlier. Report which budget expired so operations can distinguish a slow dependency from excessive retries.",
    implications: "Allocate one overall deadline across attempts. A timed-out write may already have committed. Retry it only when the business effect can be safely repeated or reconciled."
  },
  "async-multithreading-resilience__exponential-backoff-jitter-polly": {
    overview: "When many clients see the same outage, identical retry intervals create synchronized traffic spikes. Increasing delays with random jitter spreads attempts while giving the dependency time to recover.",
    question: "How much load can retries amplify?",
    walkthrough: "Three layers each making up to three attempts can generate as many as 27 downstream attempts from one initial call. A retry budget at one appropriate layer limits amplification. Exponential spacing reduces pressure during a persistent fault, and jitter prevents clients starting at the same moment from aligning later attempts. Include backoff inside the caller’s remaining deadline.",
    example: "In a Polly pipeline, give a retryable read bounded attempts, an explicit transient failure predicate and jitter. Run an outage test and compare downstream attempt count with original request count.",
    implications: "Configure bounded attempts and an overall deadline in the resilience pipeline. Respect meaningful server retry hints and avoid stacking independent retries at every service layer."
  },
  "async-multithreading-resilience__prevent-two-workers-processing-the-same-job": {
    overview: "Claim a job with an atomic state transition so only one worker can obtain the current claim. A lease allows recovery when that worker dies, but a paused worker may later resume.",
    question: "What must be atomic in the claim and completion paths?",
    walkthrough: "Claim a job by conditionally updating its status, owner and lease generation in one storage operation. Treat zero affected rows as a lost race. A worker completing the job must match its current generation. Otherwise it can overwrite a newer retry after losing its lease. If an external call has already happened, conditional completion alone cannot undo that external effect.",
    example: "Worker A holds generation 5, pauses, then B acquires 6. A’s completion WHERE generation = 5 affects zero rows. Use the stable business operation ID with any payment provider in addition to this storage check.",
    implications: "Include a claim version in completion writes and make side effects idempotent. Test a pause long enough for a second worker to claim the job."
  },
  "asp-net-core-web-apis__request-lifecycle-middleware-pipeline": {
    overview: "Middleware forms a nested chain around the endpoint. A request flows inward through components that call next, and response processing unwinds outward. A component returning early skips everything downstream.",
    question: "How does middleware ordering change the observed request?",
    walkthrough: "A component can run code before next, await downstream work and run more code afterward. Exception handling must surround any component whose errors it translates. Routing selects endpoint metadata; authentication sets the caller principal; authorization evaluates the selected policy. Static files or another short-circuit can finish before later middleware runs. Response headers generally need to be set before the body has started.",
    example: "With logging A, logging B and the endpoint E, normal order is A-in → B-in → E → B-out → A-out. A short-circuit in B skips E while A still sees the returned response.",
    implications: "Put exception handling around work it must observe. Place authorization where the selected endpoint and authenticated identity are available. A test that only checks successful requests can miss ordering bugs."
  },
  "asp-net-core-web-apis__controllers-vs-minimal-apis": {
    overview: "Minimal APIs can keep a small endpoint’s binding and response contract near its handler. Controllers group actions and support conventions, attributes and filters across a larger API surface.",
    question: "How do you compare equivalent endpoint implementations?",
    walkthrough: "Trace a request through binding, validation, authorization, handler invocation and response serialization. Minimal APIs can express these through route handlers, endpoint metadata, groups and filters. MVC controllers bring action selection, controller conventions and MVC filters. A small handler can still access a complex domain service. Compare the contract each implementation exposes, including error bodies and OpenAPI descriptions, before moving existing clients.",
    example: "Port a single endpoint with malformed input, a missing resource and a valid request. Contract tests should verify status, headers and body for all three paths. A matching happy-path response alone is insufficient.",
    implications: "Decide by team conventions and contract complexity. Keep application operations independent of either HTTP style so a change of routing style does not require rewriting business rules."
  },
  "asp-net-core-web-apis__model-binding-validation": {
    overview: "Binding turns route, query or body data into parameters. Validation checks constraints such as a positive quantity. Business rules may need additional state, such as whether the inventory can fulfill that quantity.",
    question: "What happens between receiving JSON and changing an entity?",
    walkthrough: "Deserialization and binding construct request values from allowed sources. Structural validation can check required fields, bounds and formats. Domain validation may depend on data and must share the appropriate consistency boundary with the write. Bind to a request DTO rather than a persistence entity, then map explicitly to the allowed command. Framework defaults for automatic validation depend on endpoint style and configuration.",
    example: "An UpdateProfile payload should expose displayName, while tenantId and roles come from trusted server context. A positive requested quantity passes shape validation yet can still be refused by an atomic inventory reservation.",
    implications: "Use a dedicated input model that exposes only editable fields. Return precise field errors for malformed data and handle state-dependent failures within the operation that owns the invariant."
  },
  "asp-net-core-web-apis__di-lifetimes-in-practice-the-pitfalls": {
    overview: "A transient service is created on resolution, a scoped service is shared within its scope, and a singleton lives across scopes. Dependency injection can manage disposal for instances it owns.",
    question: "Which scope owns creation and disposal?",
    walkthrough: "The root provider exists for the application lifetime. Each request scope can create a scoped graph shared within that request and dispose it when the request finishes. Transient services can be created several times within one graph. A singleton can be safely shared only if it and retained dependencies support the resulting concurrency. Background jobs require an explicit scope when they need a unit of work.",
    example: "Resolve the same scoped dependency twice inside one request and again inside a second. Expect the first pair to share identity and the second request to receive a different instance.",
    implications: "Follow the longest-lived consumer when reviewing a dependency graph. A stateful transient retained by a singleton effectively becomes shared and may suddenly need thread safety."
  },
  "asp-net-core-web-apis__singleton-depending-on-scoped-captive-dependency": {
    overview: "A background singleton that captures a request-scoped DbContext would reuse one unit of work across unrelated jobs. The captured context may accumulate tracked entities and see concurrent use.",
    question: "Why does injecting IServiceProvider alone fail to fix the lifetime?",
    walkthrough: "Resolving a scoped dependency from the root can still attach it to the root lifetime or trigger scope validation. The singleton must explicitly create a scope, resolve the job handler from that scope, await its work and dispose the scope. Avoid handing scoped objects to fire-and-forget tasks because those tasks may outlive the scope that owns their dependencies.",
    example: "await using var scope = scopeFactory.CreateAsyncScope();\nvar handler = scope.ServiceProvider.GetRequiredService<JobHandler>();\nawait handler.ProcessAsync(job, stoppingToken);",
    implications: "Inject a scope factory and create a scope per job, resolving and using the context inside it. Dispose that scope after all work depending on it has completed."
  },
  "asp-net-core-web-apis__the-options-pattern-configuration": {
    overview: "Bind related settings into a typed options object and validate required values and ranges. This makes the contract explicit and catches configuration mistakes before a rare request reaches the affected path.",
    question: "How does a configuration update reach existing work?",
    walkthrough: "Providers load settings, binding maps configuration keys to properties, and options validation checks the resulting object. A reload-capable provider can notify IOptionsMonitor, while a scoped snapshot gives a stable instance during one scope. A running background operation that repeatedly reads CurrentValue could mix old and new settings mid-operation. Capture one validated configuration when that operation starts if consistency matters.",
    example: "For a batch that uses both a region and an endpoint, read them from one options instance. Invalid configuration such as a negative timeout should fail startup or follow an explicitly tested reload policy.",
    implications: "IOptions supplies a stable value, IOptionsSnapshot gives scoped snapshots, and IOptionsMonitor supports observing changes when the provider reloads. Decide whether a running operation must use one consistent settings version."
  },
  "asp-net-core-web-apis__global-exception-handling-problemdetails": {
    overview: "An exception handler can translate known application failures into predictable HTTP responses and produce a generic server error for unexpected faults. ProblemDetails gives clients a consistent machine-readable shape.",
    question: "Where should HTTP error semantics be defined?",
    walkthrough: "Map anticipated outcomes consistently. A missing customer can become 404, a conflicting version 409 or a failed conditional request 412, depending on the API contract. An unexpected infrastructure failure needs a safe generic response and diagnostic correlation. ProblemDetails fields such as type and status help clients branch without parsing human text. Response-started failures need a streaming-specific policy.",
    example: "Two callers receive localized descriptions for the same conflict. Both should still be able to identify its stable type and decide whether to refetch the entity. Log the trace ID with the underlying exception.",
    implications: "Include a trace identifier for support and keep sensitive exception details in server logs. Once response headers or streaming content have been sent, replacing the entire response may be impossible."
  },
  "asp-net-core-web-apis__idempotent-endpoint-handling-duplicate-requests": {
    overview: "A client times out submitting an order and repeats the POST with the same idempotency key. Persist the request fingerprint, outcome and order creation under a uniqueness guarantee.",
    question: "How do you handle two identical POSTs before either completes?",
    walkthrough: "Claim the key under a uniqueness constraint scoped to caller and operation. Store a canonical request fingerprint so a reused key cannot silently change the amount or recipient. Either coordinate the claim and business write in one transaction or maintain a recoverable in-progress state. On success replay the established result. Set retention using real client retry windows, including delayed mobile clients.",
    example: "For key K, POST amount 20 twice concurrently. Both calls may wait or one may receive an in-progress response, but eventually both lookups should identify the same order. Reusing K for amount 30 should fail clearly.",
    implications: "Define responses for a repeated completed request, an in-flight request and a reused key with different input. Scope keys by caller or tenant to avoid returning another customer’s result."
  },
  "asp-net-core-web-apis__rate-limiting-middleware-net-7": {
    overview: "A token bucket allows short bursts within a sustained rate. A concurrency limiter caps in-flight work, which better protects an endpoint dominated by slow calls. Partition the policy by the identity bearing the cost.",
    question: "Which limiter matches the resource at risk?",
    walkthrough: "A fixed or sliding window controls arrivals over time, and a token bucket permits a bounded burst while replenishing at a configured rate. Neither directly caps the number of long-running calls. A concurrency limiter does. Partition quotas by a verified identity and decide what happens before authentication. Bound waiting queues because a request rejected promptly can be cheaper than one waiting past its deadline.",
    example: "A dependency can handle 20 simultaneous exports, whether each lasts one or thirty seconds. Protect the export path with a concurrency limit and test that cancellation frees a permit for another caller.",
    implications: "A local limiter applies per instance. Check fleet-wide behavior after scale-out, bound any waiting queue and tell clients when a rejected request can reasonably be retried."
  },
  "asp-net-core-web-apis__api-versioning-backward-compatibility": {
    overview: "An old client may ignore an added optional property yet fail when a familiar enum gains a new value. Compatibility depends on how real clients parse and rely on the contract.",
    question: "Which API changes are breaking despite an unchanged URL?",
    walkthrough: "Removing a field, narrowing allowed values or adding a required request field clearly affects clients. Subtler changes include reversing pagination order, changing a default currency, changing nullability or returning a new status code that older clients treat as fatal. A version may live in the URL, header or media type. Whichever scheme you choose, define compatible changes and support overlap during migration.",
    example: "Add an unknown enum value to a consumer fixture and run the oldest supported client. If deserialization fails, introduce tolerant parsing or a version boundary before rolling out the new value.",
    implications: "Evolve additively, run consumer contract tests and version genuinely incompatible behavior. Publish a migration window and measure remaining old-version traffic before removing it."
  },
  "asp-net-core-web-apis__authentication-middleware-jwt-oauth2-oidc": {
    overview: "The identity provider authenticates a user and issues tokens. An API validates the access token intended for it, constructs a principal and evaluates authorization policies for the requested operation.",
    question: "What is the difference between unauthenticated and forbidden?",
    walkthrough: "The authentication handler validates the credential and constructs a principal. An authorization policy evaluates required claims, scopes or resource relationships on that principal. Missing or unacceptable credentials commonly result in a challenge, while a verified identity lacking permission receives a forbid response. OAuth access tokens need not all be JWTs; use the validation mechanism intended for the token format and authority.",
    example: "Request the same invoice with no token, with a valid token for another audience and with a valid token lacking tenant access. The outcomes test three distinct boundaries in the middleware pipeline.",
    implications: "Keep ID tokens in the sign-in context. Check issuer, audience, signature and lifetime on access tokens, then require the permissions and resource ownership needed by the endpoint."
  },
  "asp-net-core-web-apis__middleware-vs-filters-vs-endpoint-filters": {
    overview: "Middleware can observe broad HTTP concerns, including requests that never reach a controller. MVC filters wrap stages of MVC execution. Endpoint filters can inspect bound arguments and results around a minimal API handler.",
    question: "How do you decide where cross-cutting logic belongs?",
    walkthrough: "Choose the narrowest layer that sees the required information over all intended requests. An HTTP correlation ID must cover routing failures too, which favors middleware. A rule needing MVC model state belongs inside MVC or the application. A minimal endpoint filter can inspect its bound arguments before invoking its handler. Domain invariants still belong in the use case when non-HTTP callers must obey them.",
    example: "Add a feature to both a minimal route and an MVC action. An MVC-only filter will cover just one of them. Test the two normal entry points before claiming the rule applies globally.",
    implications: "Place correlation and exception handling where they cover the required surface. Put endpoint-specific validation where typed arguments and the endpoint contract are available."
  },
  "asp-net-core-web-apis__ihostedservice-backgroundservice": {
    overview: "A BackgroundService runs a long-lived asynchronous loop under host lifecycle management. Read the stopping token, await work, and create a dependency scope for each independent unit that needs scoped services.",
    question: "What does graceful shutdown mean for a worker?",
    walkthrough: "Stop acquiring new work, signal the current operation, and finish or safely abandon it within the host’s shutdown budget. An in-memory queue loses outstanding work on abrupt process death. For a durable broker, commit the effect before acknowledgement and tolerate redelivery. Surface fatal worker failures because a process can remain externally reachable while its only worker stopped making progress.",
    example: "Deploy while a worker is halfway through a five-minute import. Record which rows committed and whether a replacement instance can resume or repeat the import without duplicating them.",
    implications: "Decide how the loop handles transient failures and orderly shutdown. If the host dies between receiving and completing a durable job, its delivery policy must support safe recovery."
  },
  "asp-net-core-web-apis__health-checks-liveness-readiness-deps": {
    overview: "Liveness asks whether restarting this process would help. Readiness asks whether the instance should receive traffic now. A process warming its cache can be alive while temporarily unready.",
    question: "How should a health probe behave during a shared dependency outage?",
    walkthrough: "A liveness probe can trigger process restarts, so use it for failures a restart can plausibly fix. A readiness probe changes routing and can temporarily remove an instance from traffic. If all replicas depend on the same database, making all of them unready may be appropriate for some APIs, but can eliminate otherwise functional endpoints. Separate startup delay and external dependency diagnostics where useful.",
    example: "Disable the database in staging while keeping the app process healthy. Verify the intended client response, load-balancer routing and restart count. An escalating restart storm indicates the probes changed the failure mode.",
    implications: "A shared database outage should rarely make every replica fail liveness and restart together. Keep probes inexpensive and give dependency checks short, explicit time budgets."
  },
  "asp-net-core-web-apis__cors-what-it-is-and-is-not": {
    overview: "A browser consults CORS response headers before exposing cross-origin responses to a page. Some requests require a preflight. Other clients can call the same API without participating in this browser policy.",
    question: "When does the browser send a preflight?",
    walkthrough: "A cross-origin request using certain methods or headers, such as an Authorization header, normally prompts an OPTIONS preflight. The browser checks allowed origin, method and headers before sending the actual request. Other cross-origin requests can be sent without preflight even when reading their responses is prohibited. Origin includes scheme, host and port. With credentials, configure an explicit trusted origin and appropriate credential settings.",
    example: "A successful request from a command-line client and a blocked browser read can coexist. Inspect the browser’s preflight and response headers, then test server-side permission checks independently.",
    implications: "Configure specific origins and credential behavior. Continue authenticating and authorizing requests at the API because CORS is a browser sharing policy."
  },
  "asp-net-core-web-apis__output-response-caching-cache-headers": {
    overview: "HTTP cache headers tell browsers and intermediaries when responses are reusable or need revalidation. Server output caching stores a generated response under an application-controlled policy and key.",
    question: "What determines whether a cached HTTP response can be reused?",
    walkthrough: "Freshness rules determine when a cached response is usable. Validators such as ETag enable a client to ask whether an older copy still matches. Vary tells HTTP caches which request headers select representations. A server-side output cache separately decides which endpoint, route, query or other dimensions form its storage key. A missing dimension can expose one representation to the wrong caller.",
    example: "GET returns an ETag. A later If-None-Match can receive 304 and reuse the existing body. Test a different language or tenant separately to verify those requests do not accidentally reuse the same representation.",
    implications: "Identify every dimension that changes output, such as locale, query parameters or user identity. Test two callers with different permissions to make sure a shared entry cannot serve private content."
  },
  "asp-net-core-web-apis__signalr-websockets-hubs-redis-backplane": {
    overview: "A hub maps connections to server methods and client messages. With multiple app instances, a backplane can forward a message to the instance holding the target connection.",
    question: "What does scale-out change for live connections?",
    walkthrough: "Each connected client has a transport to a particular application instance. A message produced elsewhere needs a scale-out path to reach it. A Redis backplane broadcasts routing information and messages between servers; managed hub services offer another topology. Deployment choices can introduce connection affinity requirements. A SignalR hub instance is short-lived, so keep durable conversation state outside hub instance fields.",
    example: "Connect two clients through different app instances and send a group message. Then drop the backplane and reconnect a client. Verify live delivery and missed-message recovery as two separate behaviors.",
    implications: "Reconnection and message history are separate concerns. Keep durable chat history outside the live transport and let clients recover missed messages from a cursor after reconnecting."
  },
  "asp-net-core-web-apis__what-makes-a-good-api-design": {
    overview: "Design a request around what a client needs to achieve. For a list endpoint, define stable ordering, pagination, error responses and the meaning of a missing resource before choosing controller names.",
    question: "How do you design a contract that works under retries and growth?",
    walkthrough: "Start with resource identity, operations, success semantics and expected failures. Specify which operations can be repeated safely, how clients continue a paged result, and what happens when a write arrives with an outdated version. Provide stable machine-readable errors and meaningful HTTP status codes. Choose consistent naming after settling these behavioral guarantees because clients depend on both.",
    example: "For create-order, define 201 with the order location, validation feedback for invalid input, and the behavior of a retry after a timeout. A client should be able to recover the order without guessing whether it exists.",
    implications: "Test the failure paths from a client’s perspective. A timeout after creation, a validation error and a permission denial require different client actions and should have distinguishable contracts."
  },
  "asp-net-core-web-apis__openapi-swagger-contract-first": {
    overview: "An OpenAPI document describes paths, inputs, schemas and responses. Reviewing it before implementation lets service and client teams settle on error shapes and optional fields early.",
    question: "What can a schema describe, and what needs executable examples?",
    walkthrough: "A schema expresses structural properties, allowed operations, required fields and responses. Some behaviors such as idempotency retention, permissions and cross-field invariants require descriptions and tests. Contract-first development lets consumers validate assumptions before the backend is ready. Keep generated code and service implementation aligned through compatibility checks and tests against the deployed interface.",
    example: "Marking a field optional and allowing null are distinct decisions. Test an omitted field, an explicit null and a valid value with the generated client and the real server before calling the schema complete.",
    implications: "Run compatibility checks and validate the implementation against the contract. Generated clients amplify schema mistakes, so include examples for edge cases such as empty results and missing properties."
  },
  "asp-net-core-web-apis__graphql-when-it-helps-and-when-it-hurts": {
    overview: "GraphQL lets clients select related fields in one request, which helps screens with varying data needs. A resolver per field can also generate hundreds of database calls for a modest-looking query.",
    question: "How can one GraphQL request cause hundreds of database queries?",
    walkthrough: "The root resolver may load 100 orders. If each nested customer field independently queries storage, one request becomes 101 queries. Batch related keys per request, preserve result-to-key mapping and apply authorization within the data boundary. Cap depth, width and expensive field combinations because a syntactically small nested selection can produce a large result graph.",
    example: "Compare an orders-plus-customer selection before and after batching. Record query count, rows returned, bytes and p95 latency. One database query that returns a huge Cartesian result can also be a regression.",
    implications: "Batch related loads, enforce authorization at the data boundary, and budget query complexity and depth. Measure backend work per operation alongside HTTP request count."
  },
  "grpc__grpc-vs-rest-vs-messaging-when-each": {
    overview: "gRPC fits strongly typed calls between controlled services, REST works well for broadly consumable HTTP resources, and messaging decouples acceptance from eventual completion.",
    question: "How does a failed connection affect each communication style?",
    walkthrough: "Synchronous HTTP or gRPC calls keep caller and callee availability coupled through the response deadline. A timed-out write can still commit remotely. A broker can durably accept a command while the worker is offline, but the caller now needs a way to observe eventual completion. Choose serialization, transport and coupling separately. REST services can also implement asynchronous jobs through HTTP resources.",
    example: "For a report, POST can create a job and return its status location. Internally a queue can dispatch it while a gRPC call handles a bounded metadata lookup. One product can legitimately need all three styles.",
    implications: "Choose by timing and failure contract. A customer waiting for a quote needs a bounded response. A nightly export can return a job ID and continue after the initiating client disconnects."
  },
  "grpc__the-four-rpc-types-http-2-multiplexing": {
    overview: "Unary RPC exchanges one request and reply. Server streaming returns a sequence, client streaming uploads one, and bidirectional streaming carries independent sequences both ways. HTTP/2 multiplexes streams on a connection.",
    question: "What is ordered in a streaming RPC?",
    walkthrough: "Messages in each direction of an individual RPC stream retain their order. A bidirectional call has two independently progressing directions, so request and reply messages need application-level correlation when they are not one-to-one. HTTP/2 interleaves frames for different streams, allowing multiple RPCs on one connection. Network congestion or a slow consumer can still delay progress through shared capacity and flow control.",
    example: "For live transcription, audio chunks travel client-to-server while partial transcripts return independently. Include utterance or sequence identifiers so a late correction can update the intended transcript segment.",
    implications: "Multiple streams still share transport capacity and flow control. Decide how slow consumers, cancellation and per-stream ordering affect the service."
  },
  "grpc__why-protobuf-is-fast-compact": {
    overview: "Protobuf places field numbers and wire types on the wire, leaving names and most structural description in a shared schema. Variable-length encoding makes many small integer values compact.",
    question: "What information does the receiver need to decode a protobuf field?",
    walkthrough: "The wire tag identifies a field number and a wire type. The schema supplies meaning, such as whether a length-delimited value is text, bytes or an embedded message. Varints use fewer bytes for small unsigned values; signed integers that often have small negative values can benefit from an appropriate signed encoding such as sint32. Repeated structures and field choices influence actual size.",
    example: "A captured payload can reveal field 3 is length-delimited without telling you its business name. Retain the schema version or descriptor when storing events for later inspection and replay.",
    implications: "Measure actual payload and CPU costs. Binary encoding does not compress a large image field. Preserve schemas for debugging, compatibility checks and decoding historical messages."
  },
  "grpc__proto-contract-design-backward-compatibility": {
    overview: "A deployed protobuf field number is part of the wire contract. Add new fields under fresh numbers and reserve removed names and numbers to prevent accidental reinterpretation of old messages.",
    question: "Why is changing a field number riskier than renaming a property?",
    walkthrough: "A binary receiver matches fields by number, not the source-code name. Reusing an old number can cause archived messages or older clients to interpret a different meaning. Adding a new field usually lets older readers skip it, but business compatibility also depends on defaults and presence. Tooling that exposes JSON names introduces a separate compatibility surface.",
    example: "Replace a price-in-cents integer by adding a new money field at a fresh number. Roll out readers supporting both, migrate writers, then reserve the retired number. Do not reinterpret old cents as major currency units.",
    implications: "Test old clients reading new payloads and new clients reading old payloads. Decide how absent values and unknown enum values should affect business behavior."
  },
  "grpc__deadlines-cancellation-propagate-end-to-end": {
    overview: "A request with 500 milliseconds left cannot give each of three sequential downstream calls its own 500-millisecond budget. Propagate the original deadline and account for time already spent.",
    question: "How is a deadline different from a fresh timeout at every hop?",
    walkthrough: "A deadline expresses the latest acceptable completion. At each hop calculate the remaining time and reserve budget for returning a response. Starting a new full timeout at every hop makes the outer caller wait for work that may continue long after it has given up. Cancellation propagation allows the callee to stop expensive work, but recognition is cooperative.",
    example: "At t=0 the budget is 500 ms. Authentication uses 80 ms and queueing uses 120 ms. A database call now has at most 300 ms before reserving any response margin.",
    implications: "Pass cancellation into the actual database and network work. Reserve time to return a response and reconcile writes whose outcome is unknown when the deadline expires."
  },
  "grpc__error-handling-rpcexception-status-codes": {
    overview: "A gRPC status conveys the type of failure independently of a human-readable message. InvalidArgument can signal input the caller must change, while Unavailable can describe a transient dependency problem.",
    question: "How should callers interpret an RPC status?",
    walkthrough: "Map failure to the action a client can take. InvalidArgument describes input unsuitable regardless of service state; FailedPrecondition can mean the request is valid only after a state change. Unavailable can justify a bounded retry for a safe operation. DeadlineExceeded does not prove a write failed. Use consistent mappings across services and document any structured error details clients may depend on.",
    example: "A request to ship an unpaid order can remain invalid until payment completes. Retrying it every 50 ms without observing payment adds load and obscures the underlying precondition.",
    implications: "Map expected domain outcomes consistently and attach safe structured details where needed. Record internal diagnostics server-side and avoid exposing stack traces through RpcException messages."
  },
  "grpc__retries-without-duplicating-non-idempotent-ops": {
    overview: "If the server commits a transfer and the reply is lost, the caller cannot infer failure from a transport error. A retry with a fresh identity can create a second transfer.",
    question: "What happens after a timeout on a non-idempotent RPC?",
    walkthrough: "The client knows it did not receive confirmation. It generally cannot tell whether the server rejected, started or completed the operation. Retry under the same stable key and require the server to map that key to one business intent. Persist enough result data to reconcile a repeated call. Transparent transport retries and application-level retries should be understood together.",
    example: "Debit account A by 10 under operation D. Lose the acknowledgement after commit, then repeat D. The result should identify the first debit regardless of whether the second transport call reaches a different instance.",
    implications: "Carry one operation ID across attempts and deduplicate it atomically with the transfer. Bound retries by the deadline and retry only status codes covered by the operation’s policy."
  },
  "grpc__10-parallel-calls-partial-failure-deadline-cancel": {
    overview: "Fan out ten independent reads under one deadline and record each call’s result. A dashboard may return nine panels with one marked unavailable, while a mandatory authorization lookup needs a different failure policy.",
    question: "How does the success rule determine cancellation behavior?",
    walkthrough: "Classify each dependency as mandatory, optional or interchangeable. If all ten results are required, cancel outstanding work after a decisive failure while still observing its completion. If any three replicas are sufficient, accept a qualifying set and stop excess work. If results feed separate dashboard panels, preserve successes and mark failed panels with freshness and error information.",
    example: "An authorization service deadline should never silently become “allowed” because nine decorative calls succeeded. Express per-call policies in the composition layer and test them with independently delayed and failed dependencies.",
    implications: "Agree on partial results before implementing concurrency. Cancel unnecessary work after a decisive failure and observe all started tasks so their errors and resources are accounted for."
  },
  "grpc__interceptors-metadata-authentication-mtls-bearer": {
    overview: "An interceptor can add correlation metadata or consistent error mapping across RPCs. TLS can authenticate the server, mTLS can authenticate workloads, and bearer credentials can carry delegated identity.",
    question: "What belongs in metadata versus the application message?",
    walkthrough: "Metadata carries call-level concerns such as authorization credentials, tracing and correlation. The request message carries business data governed by the protobuf contract. Interceptors can consistently attach or inspect these values, but the server must validate credentials and decide resource access using verified context. Keep sensitive metadata out of ordinary request logs and observe header-size limits.",
    example: "An mTLS identity can establish that the caller is the orders service, while a delegated access token identifies the user context. An operation may require both a trusted workload and permission for the specific order.",
    implications: "Authenticate credentials at a trusted boundary and authorize methods and resources using verified claims. Treat incoming metadata as caller-supplied until its source and integrity are established."
  },
  "grpc__connection-mgmt-keepalive-channel-reuse-l7-load-balancing": {
    overview: "Reuse gRPC channels so connections, TLS handshakes and HTTP/2 streams are shared. A single long-lived connection through a connection-level balancer can send many RPCs to the same backend.",
    question: "Why might scaling the backend leave traffic uneven?",
    walkthrough: "A long-lived channel may reuse one HTTP/2 connection carrying many concurrent RPCs. A layer-four load balancer assigns the connection once, so adding a backend does not move existing streams. Client-side endpoint discovery with balancing or an HTTP/2-aware proxy can distribute calls more granularly. Keepalive detects broken idle connections under agreed settings; it cannot redistribute already accepted work by itself.",
    example: "Scale from two replicas to four while clients hold long-lived channels. Compare connections and RPCs per replica, then drain old connections gracefully. Equal open connection counts alone are a weak balance metric.",
    implications: "Choose client-side or HTTP/2-aware balancing if traffic must spread per call. Coordinate keepalive settings with intermediaries and test connection draining during rollout."
  },
  "grpc__why-a-browser-can-t-call-grpc-grpc-web-transcoding": {
    overview: "Browser JavaScript lacks the full low-level HTTP/2 stream and trailer controls expected by native gRPC. gRPC-Web adapts the protocol, while HTTP/JSON transcoding exposes conventional HTTP endpoints for suitable methods.",
    question: "How would you expose a gRPC service to a browser?",
    walkthrough: "A gRPC-Web client uses an encoding and trailer representation supported by the browser transport, usually with server or proxy adaptation. Transcoding maps selected RPCs into HTTP verbs, URLs and JSON, which may integrate better with public HTTP tooling. Browser and intermediary support determines available streaming modes. Treat browser access as a separate contract test, including authentication and CORS.",
    example: "A desktop gRPC client successfully streaming both directions proves only the native route. Test a real browser through the production proxy with the exact client streaming mode the feature requires.",
    implications: "Match the choice to required streaming modes and client tooling. Verify browser, proxy and server support together before promising bidirectional streaming."
  },
  "concurrency-control__optimistic-sql-rowversion-version-column": {
    overview: "Include the version read by the user in the update condition. If the stored version changed, the update affects zero rows and the service knows it would overwrite newer work.",
    question: "How does a version column detect a lost update?",
    walkthrough: "Read both the business fields and the version. Later issue one update matching the primary key and the original version. A database-managed SQL Server rowversion changes on update. An application-managed integer must be incremented in the same conditional statement. The compare-and-write is atomic; checking the version in a separate select would reintroduce a race.",
    example: "UPDATE orders SET note = @note, version = version + 1 WHERE id = @id AND version = @seen\nTwo editors read version 4. The first advances it to 5 and the second gets zero affected rows. Deletion can also yield zero rows.",
    implications: "Decide whether to reload, merge specific fields or return a conflict. A retry that blindly reapplies an old whole-record payload defeats the protection."
  },
  "concurrency-control__optimistic-nosql-etag-etag-cosmos": {
    overview: "A document read supplies an ETag representing its version. Send it with an If-Match conditional replacement. A concurrent update changes the tag, so the stale replacement fails its precondition.",
    question: "How do partition and document boundaries limit the guarantee?",
    walkthrough: "A conditional request compares the supplied ETag to the current stored version as part of the write. Only a successful match authorizes that replacement. For Cosmos DB, transactional operations spanning items are constrained by the logical partition and supported transaction mechanism. Two individually successful conditional writes in different partitions still do not provide one all-or-nothing transfer.",
    example: "Read document at E1, client B replaces it and receives E2, then A submits If-Match E1. On precondition failure A must reread and recompute, not simply relabel the old payload with E2.",
    implications: "Reread the document and recompute the intended change. The ETag protects that document. Invariants spanning several documents need coordination supported by their partition and storage model."
  },
  "concurrency-control__pessimistic-sql-locks-select-for-update": {
    overview: "Lock a row before making a decision that competing writers must serialize. For example, a transaction can lock an available seat, check its state and reserve it before committing.",
    question: "What can go wrong when the row to lock does not exist?",
    walkthrough: "A row lock can serialize updates to an existing seat row. If allocation instead checks for the absence of a reservation row, there may be no row to lock and two transactions can both observe absence. Use a unique constraint, lock a stable parent row or choose isolation and predicate protection suitable for the engine. PostgreSQL and SQL Server express locking reads differently.",
    example: "For one reservation per seat per show, enforce uniqueness on (show_id, seat_id). Even if both requests see “available,” the committed data cannot contain two reservations with that key.",
    implications: "Keep the transaction short and acquire multiple locks in a consistent order. Waiting on an external payment call while holding a seat lock can block a whole queue of customers."
  },
  "concurrency-control__pessimistic-nosql-lease-lock-document": {
    overview: "A lease document can name the current owner and expiry. Acquire or renew it through a conditional operation so two workers cannot both claim the same current version.",
    question: "How should lease acquisition and renewal be validated?",
    walkthrough: "Store the owner ID, epoch and expiry under a well-defined clock assumption. Acquire using a create-if-absent or conditional update against the observed lease state. Renew only if the current owner and epoch still match. A cleanup TTL in a document database may delete records asynchronously, so document disappearance alone is a poor clock for exclusive ownership.",
    example: "Pause A beyond its lease and let B acquire a later epoch. A’s renewal with its old epoch must fail. Test a delayed application write too, because successful rejection of renewal does not reject already in-flight writes.",
    implications: "A paused worker can outlive its lease. Condition protected writes on the current epoch or fencing value, and define how the system establishes expiry and recovers abandoned work."
  },
  "concurrency-control__distributed-locks-fencing-tokens": {
    overview: "A lock service grants writer seven a lease and later grants writer eight a newer one. Writer seven’s delayed packet may still reach the storage service after writer eight finishes.",
    question: "When can a destination still accept an old fencing token?",
    walkthrough: "A destination that stores the highest token it has observed can reject smaller tokens after seeing a newer one. It cannot infer a newer lease exists before any newer grant is observed unless it checks the authority. Define what ordering the business needs and whether repeated operations under the same token need separate deduplication. Fencing and operation identity solve different problems.",
    example: "Destination has seen token 12. A delayed write with 11 is rejected. Two copies of a debit with 12 can still double-charge unless the debit itself has an idempotency key.",
    implications: "Attach the grant number to each write and have storage reject obsolete grants. Fencing needs enforcement at the resource and a grant authority capable of issuing ordered tokens."
  },
  "concurrency-control__isolation-levels-acid": {
    overview: "ACID combines transaction atomicity, preservation of enforced invariants, isolation and durability. Isolation level specifies which effects of overlapping transactions can be observed.",
    question: "How do isolation and consistency interact with a business rule?",
    walkthrough: "Atomicity ensures a transaction’s writes commit together. Isolation defines allowed concurrent observations. Consistency requires the schema and application decisions to encode the invariant. Durability concerns acknowledged commits under the configured failure model. Even an atomic update can be logically wrong if it debits the wrong account. Even two locally valid transactions may combine badly if isolation permits a conflicting decision.",
    example: "Two bookings each see one seat remaining and insert separate rows. Define a database constraint or conditional transition on the seat count. Merely wrapping each insert in its own transaction does not state the capacity invariant.",
    implications: "State the anomaly that matters. Reading balances consistently and preventing two doctors from both leaving call duty impose different requirements on concurrent transactions."
  },
  "concurrency-control__concurrency-anomalies-dirty-non-repeatable-phantom-write-skew": {
    overview: "Reading uncommitted data is a dirty read. A second read seeing a changed row is non-repeatable. A repeated predicate seeing new qualifying rows is a phantom. Write skew can happen when transactions read shared facts but update different rows.",
    question: "How do you identify an anomaly from a timeline?",
    walkthrough: "Ask whether a read saw an uncommitted write, the same row twice with different values, a different set matching a predicate, or two decisions based on overlapping facts. These distinguish dirty reads, non-repeatable reads, phantoms and write skew. Snapshot-based engines can provide stronger behavior than the minimum allowed by the level name, so reason from the actual engine and transaction boundaries.",
    example: "T1 and T2 each see Alice and Bob on call. T1 removes Alice, T2 removes Bob. They update different rows and each individual check passed, yet the final table has zero doctors on duty.",
    implications: "Two doctors can each see another on duty and independently go off call. A stable snapshot alone may permit both commits. Enforce the invariant or use serializable execution with retry."
  },
  "concurrency-control__deadlocks-retrying-the-victim": {
    overview: "A database can break a lock cycle by aborting one transaction. The survivor commits and the victim may then rerun from a fresh transaction.",
    question: "Why must a retry repeat the reads as well as the writes?",
    walkthrough: "The deadlock victim’s transaction is rolled back. Another participant may commit while the victim starts again, so decisions derived from the old reads can be stale. Open a fresh transaction, reread data, recompute the decision and bound attempts by the caller’s deadline. External effects already performed do not roll back with SQL, which is why an outbox or provider idempotency can be necessary.",
    example: "A transfer victim originally saw a balance of 100. The survivor withdraws 80. Retrying the old decision to withdraw 50 would violate the new balance; rerun the availability check on the current row.",
    implications: "Retry the entire logical transaction with a bound and jitter. Avoid repeating external side effects inside it. Inspect the deadlock graph and align lock ordering to reduce recurrence."
  },
  "ef-core-data-access__dbcontext-lifetime-pooling-thread-safety": {
    overview: "A DbContext tracks a unit of work and is unsuitable for concurrent operations. Give parallel jobs independent contexts even if each job uses asynchronous calls.",
    question: "What does pooling a DbContext actually reuse?",
    walkthrough: "A context owns a change tracker and a unit of work. Pooling reuses context instances after EF resets its internal state, reducing setup costs. It does not make one instance safe for two simultaneous queries. Per-request values added by application code can survive unless explicitly initialized and reset. Underlying database connection pooling has separate limits, identity keys and diagnostics.",
    example: "Two concurrent tasks using Task.WhenAll should resolve independent contexts if both access EF. Verify each context receives the correct tenant state, especially when one is reused after a different tenant’s request.",
    implications: "Context pooling reuses instances after disposal. Carefully reset application-specific state such as tenant identity. Connection pooling is a separate facility with a different lifecycle."
  },
  "ef-core-data-access__change-tracking-entity-states-asnotracking": {
    overview: "A tracking query records entities and their state so SaveChanges can generate writes. AsNoTracking avoids maintaining that update state for read-only work such as an export.",
    question: "How do entity states become SQL commands?",
    walkthrough: "A tracked entry can be Added, Unchanged, Modified or Deleted; detached entities are outside the tracker. EF compares appropriate original and current values or observes explicit changes and builds inserts, updates and deletes during SaveChanges. A query that returns a DTO of scalar fields can avoid tracking entities entirely. A projection that still includes an entity can track it by default.",
    example: "Load one tracked customer, change its name and save. Compare with reading a detached customer, changing its name and saving the context. The second change needs an explicit tracking or update decision to reach storage.",
    implications: "Project to the fields required by the response. Tracking a long report in a long-lived context can retain many entities, while a detached entity needs explicit handling for later writes."
  },
  "ef-core-data-access__asnotracking-vs-asnotrackingwithidentityresolution": {
    overview: "A read-only join may return a customer repeatedly across orders. Ordinary no-tracking materialization can create separate customer instances. Identity resolution reuses an instance per key during that query without attaching it to the context.",
    question: "When can identity resolution save memory on a read-only query?",
    walkthrough: "Suppose 10,000 order rows refer to only 20 customers. A no-tracking graph can allocate repeated customer objects. Identity resolution maintains a temporary key map during enumeration, returning the same object for each occurrence of one entity. This adds lookup and memory cost but can avoid many objects. The temporary tracking machinery is separate from the context’s ordinary update tracking.",
    example: "Check ReferenceEquals on customers reached through two orders with the same customer ID, then compare allocations and context change-tracker count across normal tracking, no tracking and no tracking with identity resolution.",
    implications: "Measure the trade-off between temporary identity bookkeeping and duplicate objects. A flat DTO projection may avoid the object graph entirely."
  },
  "ef-core-data-access__tracking-vs-asnotracking-the-n-1-problem": {
    overview: "Tracking controls entity identity and change detection. N+1 describes a query-count issue, such as loading one page of orders and then fetching each order’s lines on demand.",
    question: "How do you spot N+1 without guessing from source code?",
    walkthrough: "Count database commands over the complete endpoint, including serialization, mapping and lazy navigation access. One root query followed by one query per parent causes command count to grow with page size. Change tracking can influence whether already-loaded related entities are reused, which makes small tests deceptive. Query a fresh context with realistic distinct parents when reproducing the pattern.",
    example: "Increase page size from 10 to 100. If command count rises from 11 to 101, reducing per-command latency alone leaves the scalability problem. Project the response shape or batch related rows.",
    implications: "Log command counts for a representative page. Turning off tracking can reduce memory yet leave every extra round trip intact. Project or explicitly load the required relationship in batches."
  },
  "ef-core-data-access__iqueryable-sql-client-side-evaluation": {
    overview: "EF translates supported expression-tree operations to SQL. A non-translatable predicate normally fails during translation, while some final projection work can run on the client.",
    question: "What happens when the provider cannot translate an expression?",
    walkthrough: "EF Core generally rejects an untranslatable filtering or ordering expression because silently moving it to the client could fetch an unbounded dataset. Top-level result shaping can include supported client-side work after fetching the necessary data. Explicitly crossing into client evaluation is valid once the cost is understood. Verify translation using generated SQL and command logs at execution.",
    example: "First filter active rows by indexed tenant ID in SQL and project only the needed text. If a custom scoring function must run locally, document how many candidate rows the SQL stage can return.",
    implications: "Inspect generated SQL before introducing AsEnumerable to bypass a translation error. If client work is necessary, first narrow the server-side dataset to a bounded size."
  },
  "ef-core-data-access__include-theninclude-filtered-includes-split-queries": {
    overview: "Include and ThenInclude load related entities. Including multiple sibling collections in a single query can multiply result rows. Split queries fetch related groups separately and assemble them.",
    question: "Why can two collection includes multiply the result size?",
    walkthrough: "If one blog has 10 posts and 10 contributors, joining both sibling collections in one query can yield 100 rows for that blog. Each row may repeat the same parent payload. A split query retrieves parent and related sets separately and associates rows by key. Its multiple statements can observe changes between reads unless the transaction provides a suitable snapshot.",
    example: "Measure bytes and logical rows for a parent with one large text field. Project away unused fields first, then compare single and split query modes under both ordinary load and concurrent modifications.",
    implications: "Compare transferred bytes, round trips and consistency under concurrent updates. Filtered includes on a tracking context can also encounter entities already tracked through navigation fixup."
  },
  "ef-core-data-access__savechanges-transactions-unit-of-work": {
    overview: "Stage several related entity changes in one context and call SaveChanges. A relational provider typically wraps the writes from that call in a transaction so an incomplete batch can roll back.",
    question: "When is one SaveChanges call insufficient as a transaction boundary?",
    walkthrough: "One call can atomically persist a supported provider’s related tracked changes. If the workflow calls SaveChanges to obtain a generated ID, runs another SQL operation and then saves again, separate commits can expose a half-finished workflow. An explicit transaction can group database operations on the same resource. The context tracks pending changes but is not itself a distributed transaction manager.",
    example: "Create an order and a dispatch intent in one SaveChanges call. Inject failure while writing the intent and confirm neither row commits. Performing HTTP dispatch between two successful SaveChanges calls has different failure semantics.",
    implications: "Separate SaveChanges calls may need an explicit shared transaction. Publishing an external event still needs coordination such as an outbox even when every SQL write is atomic."
  },
  "ef-core-data-access__optimistic-concurrency-in-ef-rowversion": {
    source: { title: "EF Core concurrency conflict handling", url: "https://learn.microsoft.com/en-us/ef/core/saving/concurrency" },
    overview: "Configure a rowversion as an EF concurrency token. EF includes the original token in the update predicate. When no row matches, it reports a concurrency conflict instead of silently overwriting newer data.",
    question: "Which values do you compare after DbUpdateConcurrencyException?",
    walkthrough: "EF tracks the token originally read and includes it in the update or delete predicate. When the expected row is absent, compare original values, proposed application values and current database values. Nonoverlapping changes may be mergeable, but two edits to the same business field need a domain policy. A deleted row requires a separate decision. On disconnected HTTP edits, preserve the token the user actually saw.",
    example: "Client reads name Ada, version V1. Another user changes only the phone, generating V2. A merge may keep the new phone and proposed name. Refresh originals to V2 and retry only after deciding that merge is valid.",
    implications: "Compare original, proposed and current values before merging. Refresh the concurrency token when retrying, and surface a user-visible conflict where automatic merging would lose intent."
  },
  "ef-core-data-access__migrations-zero-downtime-schema-changes": {
    overview: "Deploy a new nullable column while old application instances still run. Roll out compatible readers and writers, backfill in bounded batches, then enforce the new constraint after verification.",
    question: "Why split a schema change into several releases?",
    walkthrough: "During a rolling deployment, old and new binaries may both write data. A new nonnullable field cannot be assumed present until old writers are retired and historical rows are backfilled. Expand first, deploy compatible readers and writers, migrate existing rows in bounded restartable batches, verify completeness, then enforce the constraint. Remove compatibility code after the rollback window closes.",
    example: "When renaming a column, an immediate destructive rename breaks old instances. Add the new column, maintain compatible values while migrating, switch reads, then remove old writes and finally the old column.",
    implications: "Remove the old representation only after old binaries and rollback paths have expired. Inspect locking and runtime on production-sized data before applying schema changes."
  },
  "ef-core-data-access__bulk-batch-operations": {
    overview: "Batching multiple statements saves round trips. A set-based update can go further by changing every qualifying row directly without loading an entity per row.",
    question: "How do set-based updates affect tracked state and concurrency?",
    walkthrough: "A set-based update executes directly in the database and may bypass EF change tracking and the concurrency checks normally generated by SaveChanges. Include a version predicate yourself when needed and inspect affected rows. An entity already tracked by the context can still hold the old values and later overwrite part of the direct update. Separate the unit of work or refresh tracked state deliberately.",
    example: "Run a bulk price adjustment, then inspect an earlier tracked Product. Changing its price from the stale baseline can generate an unintended update. Requery or reload before applying decisions based on the new price.",
    implications: "Verify predicates, affected counts and transaction boundaries. Direct database updates can leave already tracked entities stale and bypass application-side per-entity behavior."
  },
  "ef-core-data-access__running-raw-sql-safely": {
    overview: "Parameterize data values so the database receives the SQL structure and its inputs separately. An interpolated string is safe only when the receiving API preserves parameter binding.",
    question: "Which parts of a query can be parameterized?",
    walkthrough: "Parameters represent data values, allowing the database to distinguish syntax from input and often reuse plans. Identifier choices such as an ORDER BY column usually need a fixed mapping from allowed application options to trusted SQL fragments. Passing an already formatted string to a raw SQL API loses parameter binding, even if string interpolation originally made the code look structured.",
    example: "For “sort by date or total,” map the enum to one of two literal column names. Bind the tenant ID and minimum total as parameters. Verify logged command metadata shows separate values and SQL text.",
    implications: "Table or column identifiers generally cannot be value parameters. Map allowed choices to known identifiers, and run the query under a database identity limited to required operations."
  },
  "ef-core-data-access__global-query-filters-multi-tenant-soft-delete": {
    overview: "A global filter can append a tenant predicate or exclude soft-deleted rows from ordinary EF queries. It reduces repeated plumbing and helps prevent accidental omissions.",
    question: "Where can a global query filter fail to enforce isolation?",
    walkthrough: "Filters help apply tenant or soft-delete predicates on supported query paths. They do not automatically validate the tenant on inserted entities or protect every raw SQL path. Administrative code may deliberately bypass filters. Context pooling can also complicate tenant state. Treat the filter as one layer and derive the tenant from verified execution context on every unit of work.",
    example: "Try creating an invoice whose supplied tenant differs from the authenticated tenant, then retrieving it through an export or administrative route. A test of normal filtered list queries would miss both write and bypass paths.",
    implications: "Treat bypass paths, raw SQL and tenant assignment on writes as separate controls. Test two tenants sharing the same business identifiers, including administrative and background operations."
  },
  "ef-core-data-access__keyset-vs-offset-pagination": {
    overview: "Offset pagination skips earlier rows, which can become costly on deep pages and unstable as rows are inserted. Keyset pagination continues after the last observed ordering values.",
    question: "What must be in a continuation cursor?",
    walkthrough: "For ordering by created time and ID, the cursor must retain both values from the last item. Select rows strictly after that pair according to the same direction, tie-breaking and collation as the original order. A keyset cursor avoids rescanning an ever-growing offset, but updates to ordering fields can still move items between pages. Use stable keys or a snapshot if repeatability is required.",
    example: "WHERE created_at > @t OR (created_at = @t AND id > @id)\nORDER BY created_at, id\nA cursor containing only @t can skip rows sharing the final timestamp of the preceding page.",
    implications: "Use a deterministic order such as creation time plus unique ID and a matching index. A continuation cursor handles sequential browsing well but does not naturally provide an arbitrary page number."
  },
  "ef-core-data-access__connection-pool-exhaustion-causes-diagnosis": {
    overview: "Requests can spend seconds waiting for a free pooled connection before a fast SQL query even begins. Common causes include long transactions, leaked readers and slow clients holding streams open.",
    question: "How can a fast server-side query still exhaust a connection pool?",
    walkthrough: "Pool occupancy depends on how long callers hold connections, including transactions, readers and slow response streaming. As a rough estimate, 200 requests/s holding connections for 0.5 seconds need about 100 concurrent connections on average before tail effects. Measuring only SQL execution overlooks time waiting to acquire the connection and time retaining it after the command finishes.",
    example: "Capture acquisition duration, command duration and connection hold duration separately. If command time is 10 ms but hold time is 500 ms, inspect the code between the read and disposal before changing an index.",
    implications: "Separate acquisition time from execution time, inspect active sessions and scope disposal tightly. Raising the pool limit can move the bottleneck into the database."
  },
  "ef-core-data-access__a-query-50ms-local-but-5s-in-prod-diagnose": {
    overview: "Split the five seconds into pool wait, server execution, result transfer and application materialization. A fast local query might use tiny tables, different parameters and no competing writers.",
    question: "Which comparison separates plan problems from request-path problems?",
    walkthrough: "Time the SQL statement on the production server with the application’s parameters and session settings, then compare it with the distributed trace. A five-second HTTP span can include queueing, pool acquisition, blocking, multiple SQL commands, network transfer or object mapping. If the database itself is slow, investigate the actual plan, waits and data distribution. If SQL is fast, follow the missing time elsewhere.",
    example: "A trace shows 4.7 s waiting for a connection and 45 ms executing SQL. Rewriting the predicate cannot recover the missing seconds. Look for long-held connections and concurrent demand first.",
    implications: "Capture the actual production plan and relevant waits for representative parameters. Compare estimated and actual row counts before changing indexes or increasing command timeouts."
  },
  "ef-core-data-access__transaction-isolation-levels-deadlocks": {
    overview: "Isolation determines what concurrent reads may observe and how writers coordinate. Under locking isolation, a transaction can hold resources another transaction needs, forming a cycle when acquisition order differs.",
    question: "Why can stronger isolation change both correctness and latency?",
    walkthrough: "At locking levels, protecting a range or retaining locks longer can serialize more competing operations. At row-versioned levels, readers may see consistent historical versions while writers still compete on current rows. Pick a level by the anomaly the business cannot tolerate, then examine the actual access path and update order. A missing selective index can expand the set of rows touched and increase contention.",
    example: "If two transactions update customers then invoices in opposite orders, changing read isolation may leave the write cycle intact. Collect the deadlock graph and make both routines acquire resources consistently.",
    implications: "Choose isolation for correctness and keep transactions short. Row-versioned reads can reduce reader-writer blocking while write-write deadlocks still require investigation and bounded retries."
  },
  "ef-core-data-access__what-acid-actually-guarantees": {
    overview: "A transfer debits one account and credits another in one transaction. Atomicity prevents half a transfer. Constraints preserve enforced rules, isolation controls concurrent visibility, and durability defines what survives a successful commit.",
    question: "Which failures does a committed transaction cover?",
    walkthrough: "A transfer recorded within one database transaction either commits both ledger rows or neither. A declared foreign key or check constraint can prevent invalid local states. Isolation defines the effect of interleaving other transactions. Durability depends on a successful commit and the engine’s durability configuration. A separate email, a replica read and a cross-region disaster each require guarantees beyond the transaction’s local boundary.",
    example: "Kill the process before commit, immediately after commit, and after sending a confirmation. Verify ledger rows, client retry behavior and confirmation delivery separately. They cross distinct persistence boundaries.",
    implications: "The database cannot enforce an unstated business invariant. Identify which rules live in constraints, transaction logic or external systems and test the promised failure behavior."
  },
  "ef-core-data-access__index-design-composite-order-covering-indexes": {
    overview: "For recent orders by customer, an index beginning with customer ID and then order time can support equality filtering and ordered traversal. Included columns can supply projected values without extra lookups.",
    question: "How do you pick the order of a composite index?",
    walkthrough: "Start with the query’s equality predicates, range predicate, ordering and projection. For one customer over a time range, customer then timestamp can narrow to a contiguous region and produce rows in useful order. An index with timestamp first may scan orders from every customer in that interval. Included fields can cover output but do not supply leading search order. Validate against the rest of the workload too.",
    example: "For WHERE customer_id = @c ORDER BY created_at DESC, compare an index on (customer_id, created_at) with two separate single-column indexes. Inspect sorts, reads and write overhead under representative data.",
    implications: "Design around the predicate, sort and projection together. Every extra index increases write cost and storage, so verify the actual plan and workload before keeping it."
  },
  "ef-core-data-access__optimistic-vs-pessimistic-concurrency": {
    overview: "Optimistic control detects intervening changes at commit time. Pessimistic control prevents conflicting access while work proceeds. The cost depends on how often callers collide and how expensive a retry is.",
    question: "How does contention change the choice of concurrency control?",
    walkthrough: "Optimistic work avoids holding a resource during user think time, then rejects conflicting commits using a version check. Pessimistic work claims access before proceeding and can spend time waiting even when the caller will eventually succeed. Evaluate conflict rate, retry cost, fairness and duration of the critical section. A permanently hot item can cause optimistic retries to repeatedly discard expensive work.",
    example: "A form edited for ten minutes should generally carry a version token. A short automated allocator serving hundreds of requests for one remaining slot may favor an atomic conditional claim or brief lock.",
    implications: "Use an edit form as the test case. Holding a database lock while someone thinks is impractical. A short inventory allocation under heavy contention may justify explicit serialization."
  },
  "ef-core-data-access__read-write-splitting-with-replicas-the-catch": {
    overview: "A successful write can become visible on the primary before its replica replays it. Sending the confirmation page to a replica can make a just-created order appear missing.",
    question: "How would you enforce read-your-writes on a replica?",
    walkthrough: "Capture the replication position or equivalent marker associated with a committed write. Before serving a dependent read, verify the chosen replica has applied that marker, wait within the deadline or route to the primary. Distinguish receiving the log from applying it. Routing all reads to replicas is attractive until the UI interprets an old read as data loss.",
    example: "The confirmation page requests order 71 with a consistency marker. Replica R has only applied the preceding position. Reading from the primary now avoids a false 404 while ordinary catalogue reads can continue using R.",
    implications: "Route freshness-sensitive reads to the primary or use a replication-position guarantee where supported. Monitor lag and describe what the user sees during degraded replication."
  },
  "ef-core-data-access__normalization-denormalization-sharding-read-replicas": {
    overview: "Normalization limits inconsistent copies of facts. Denormalization precomputes a useful read shape. Read replicas distribute reads, while sharding distributes ownership of data and writes.",
    question: "Which problem is each database technique solving?",
    walkthrough: "Normalization stores facts once and enforces relationships. Denormalization duplicates selected facts for faster reads, creating an update or refresh obligation. Replication creates additional copies of the same data for availability and reads. Sharding divides write ownership across partitions, introducing routing and cross-shard coordination. A design can use all four techniques at different boundaries.",
    example: "For a slow dashboard over normalized orders, try a read projection before introducing shards. For sustained write volume beyond one owner’s capacity, a projection or another read replica cannot split write ownership.",
    implications: "Diagnose the actual limit. Adding replicas will not relieve a saturated write leader, and sharding can make a previously cheap join require coordination across nodes."
  },
  "sql-server__clustered-vs-nonclustered-index": {
    overview: "In SQL Server a clustered index stores the table’s data rows at the leaf level in key order. A nonclustered index maintains a separate structure with a locator pointing back to the row.",
    question: "What does a nonclustered lookup use as its row locator?",
    walkthrough: "On a clustered SQL Server table, a nonclustered index carries the clustering key needed to find the base row. On a heap it can use a physical row identifier. A query covered by the nonclustered index avoids that second lookup. The clustered key influences the width of other indexes, which makes stability and width important alongside query access order.",
    example: "A clustered key containing several long text columns is copied into many secondary entries as needed for locating rows. Compare index size and write amplification with a narrow stable clustering key before choosing it.",
    implications: "Choose a clustered key with downstream costs in mind. A wide or frequently changed key can make secondary indexes larger or more expensive to maintain."
  },
  "sql-server__what-a-heap-is-why-usually-avoid-one": {
    overview: "A SQL Server heap stores rows without a clustered index. When a variable-length row grows and no longer fits its page, forwarding can add extra reads when locating it.",
    question: "How do forwarding records change a heap scan or lookup?",
    walkthrough: "If a variable-length row expands and no longer fits its original heap page, SQL Server may move the row and leave a forwarding pointer. A nonclustered locator can still refer to the old position and follow the pointer, requiring extra page access. This can make a heavily updated heap behave differently from a fresh bulk-loaded copy with the same rows.",
    example: "Compare a staging heap loaded once and truncated with a heap whose variable fields grow daily. Inspect forwarded records and logical reads before deciding whether creating a clustered index is justified.",
    implications: "A heap can suit a transient bulk staging table. For a frequently updated operational table, compare lookup costs and forwarding records against a carefully chosen clustered index."
  },
  "sql-server__covering-index-include-columns": {
    overview: "An index keyed by customer and order date can include total and status at its leaves. A matching query can return all required values without visiting the base row.",
    question: "What does “covering” mean for one particular query?",
    walkthrough: "Coverage is relative to the query. A nonclustered index can supply search keys, ordering keys and returned fields without looking up the base record. INCLUDE adds non-key columns to leaf pages, reducing lookup work while preserving a smaller search key. A field needed for a selective range or required ordering may belong in the key instead. Wider leaves also mean fewer entries per page.",
    example: "For a customer’s latest ten orders, key on customer and date and include total. If the query later selects a large description too, reassess whether covering that extra projection is worth the added storage.",
    implications: "Included columns help coverage but cannot provide leading seek order. Cover frequent queries selectively because wide leaves consume memory, storage and update bandwidth."
  },
  "sql-server__key-lookup-how-to-remove-it": {
    overview: "A nonclustered seek may find qualifying row keys cheaply, then perform a key lookup for each missing projected value. Thousands of individually cheap lookups can dominate total reads.",
    question: "Why does a lookup plan work for ten rows and fail for ten thousand?",
    walkthrough: "The optimizer weighs the cost of seeking a narrow index and fetching missing columns for each candidate against scanning a wider structure. Underestimated row counts can make repeated lookups look cheap at compile time. Check actual execution count and pages read. First consider whether the application needs those missing columns. A narrower response can remove the lookup without creating any index.",
    example: "A nonclustered seek returns 40,000 keys and drives 40,000 lookups to fetch one status field. Compare including status, projecting it away, and scanning for the high-volume parameter case.",
    implications: "Compare actual lookup executions and logical reads. Include a frequently needed narrow column, narrow the projection, or accept a scan when a large share of the table qualifies."
  },
  "sql-server__filtered-indexes": {
    overview: "If almost all jobs are completed, an index restricted to pending jobs can remain small and selective. An ordered worker query can then locate the next pending job with fewer pages.",
    question: "Why might the optimizer ignore a filtered index?",
    walkthrough: "For an index filtered to pending jobs, SQL Server must prove the query only needs rows satisfying that filter. A reusable parameterized plan for arbitrary status values may lack that proof. Statistics on the filtered subset can help estimation, but maintenance still occurs when a row enters, changes within or leaves the subset. Review the exact application query and its compiled plan.",
    example: "An index on (due_at) WHERE status = 'Pending' matches a worker explicitly fetching pending jobs by due time. A generic query accepting any @status may require a different plan.",
    implications: "The optimizer must establish that the query qualifies for the filter. Inspect parameterized plans and account for index maintenance as jobs enter or leave the pending state."
  },
  "sql-server__columnstore-indexes-when-why": {
    overview: "Columnstore stores values by column in segments and compresses similar data effectively. A report scanning three columns across millions of rows can read less data and benefit from batch processing.",
    question: "How do rowgroups and segment elimination affect columnstore performance?",
    walkthrough: "Rows are organized into groups with column segments that can be compressed and read independently. Segment metadata can let the engine skip groups irrelevant to a filter. Large analytical scans benefit when they read few columns and process batches efficiently. Small or poorly organized rowgroups and scattered updates can reduce those benefits. Measure rowgroup health and segment elimination for actual predicates.",
    example: "A year of events loaded roughly in date order can let a one-day report skip many segments. Randomly mixed dates in every rowgroup reduce pruning even if the final qualifying row count is identical.",
    implications: "Compare against rowstore for selective point queries and frequent small updates. Rowgroup quality and the way data arrives influence analytical performance."
  },
  "sql-server__indexed-materialized-views": {
    overview: "An indexed SQL Server view persists an eligible view’s result through a unique clustered index. Repeated aggregates can become cheaper to read because writes maintain the derived structure.",
    question: "When does persisting a view shift too much cost to writers?",
    walkthrough: "An indexed view materializes an eligible computation and maintains it as base data changes. Repeated aggregate reads may become cheaper, but a high-rate write workload pays maintenance on the affected view entries. SQL Server requires appropriate schema binding, determinism, index structure and session options. Use the real query plan to verify that queries benefit from the maintained result.",
    example: "Measure both a monthly revenue dashboard and a batch inserting 100,000 line items before and after adding the indexed view. A faster dashboard alone cannot establish the overall capacity benefit.",
    implications: "Quantify the extra cost on every affected insert or update. Check definition restrictions, required session settings and actual plan usage before relying on the view."
  },
  "sql-server__sargable-predicates": {
    overview: "A predicate that compares an indexed timestamp directly to a start and end boundary gives the optimizer an opportunity to seek a range. Transforming every row’s value can obscure that opportunity.",
    question: "How do you rewrite a date filter without changing the boundary?",
    walkthrough: "Compute the beginning and end of the requested interval in the correct time zone, then compare the column directly against those values. A half-open interval includes the start and excludes the next start, independent of timestamp precision. SARGability gives the optimizer an opportunity for efficient access, but selectivity and statistics still determine whether a seek is worthwhile.",
    example: "WHERE placed_at >= @start AND placed_at < @nextStart\nFor a local calendar day around daylight-saving transitions, calculate both local midnights correctly before converting to the stored time basis.",
    implications: "For a day’s results, calculate the two boundaries once and use a half-open interval. Check data types and implicit conversions as well as the written predicate."
  },
  "sql-server__reading-an-execution-plan-estimated-vs-actual": {
    overview: "An estimated plan shows the optimizer’s chosen shape and predicted row counts. An actual plan adds runtime observations, letting you find where the prediction first diverged sharply from reality.",
    question: "Where should you start reading an actual execution plan?",
    walkthrough: "Find the inputs to expensive downstream work and compare estimated and actual rows at the earliest major divergence. A nested loop executed 50,000 times can amplify a small inner access cost. A sort spill suggests checking estimated cardinality and memory grants. Cross-reference elapsed time with CPU and I/O because a plan can look similar while blocking introduces very different wall time.",
    example: "Estimated 5 rows, actual 50,000 at the first filter: investigate skew, statistics or predicate correlation before forcing a join algorithm at the top of the plan.",
    implications: "Trace actual rows, executions, reads and spills from inputs upward. The operator with the largest displayed estimated percentage need not explain the longest observed delay."
  },
  "sql-server__how-statistics-drive-the-optimizer": {
    overview: "Statistics describe distributions so the optimizer can estimate selectivity and choose access paths and join strategies. A customer with millions of orders can behave very differently from the median customer.",
    question: "How can accurate single-column statistics still mislead the optimizer?",
    walkthrough: "Statistics summarize distributions and can include density information, but they cannot express every relationship among predicates. If one sales region sells almost all of a certain product, multiplying independent selectivities can underestimate or overestimate the joint result. Sampling and recent changes also matter. Diagnose using representative parameter values and the first estimate error before updating every statistic globally.",
    example: "Filtering region = North and product = Ski may return most ski orders rather than the tiny fraction predicted from independent frequencies. Compare actual combinations with estimates and assess index or statistics design.",
    implications: "Compare estimates with actual rows. Updating stale statistics may help, but correlation and skew can still defeat a model built from limited distribution information."
  },
  "sql-server__query-store": {
    overview: "Query Store keeps historical query texts, plans and runtime aggregates. After a release, it can show whether a slow query changed plans or simply ran more often under the same plan.",
    question: "How do you separate a plan regression from an increase in demand?",
    walkthrough: "Query Store aggregates runtime data by query, plan and interval. Compare execution count and per-execution cost across comparable intervals. One stable plan running ten times as often indicates a different problem from one execution suddenly reading ten times as many pages. Review wait categories and workload changes alongside plans. Plan forcing can be a temporary mitigation with monitoring.",
    example: "Yesterday: 1,000 calls × 20 ms. Today: 10,000 calls × 20 ms. Total database time rose tenfold, but a new plan is unlikely to explain it. Look for a caller or traffic-pattern change.",
    implications: "Compare equivalent time windows and workloads. Forcing a known good plan can stabilize an incident while you investigate, but revisit the decision as data distribution changes."
  },
  "sql-server__parameter-sniffing-what-how-to-fix": {
    overview: "A cached plan compiled for a tiny customer can use repeated seeks efficiently. Reusing it for a huge customer may be much slower than a scan, even though the SQL text is identical.",
    question: "Why does compile-time input change a cached plan?",
    walkthrough: "The optimizer can use a parameter’s value when compiling a plan. A rare value may favor an index seek and key lookup; a common value can make scanning cheaper. Reuse means later executions inherit that choice. Confirm the issue by comparing compiled values, runtime values, estimates and actual work. Other causes such as blocking or stale statistics can look similar from a latency chart.",
    example: "Run representative small and large tenants under the same parameterized query. If the first tenant after compilation consistently determines which group is slow, examine parameter sensitivity before applying a global cache-clearing workaround.",
    implications: "Compare plans and timings across representative parameter values. Consider targeted recompilation or parameter-sensitive strategies only after confirming that skew and plan reuse explain the regression."
  },
  "sql-server__option-recompile-local-variables": {
    overview: "OPTION (RECOMPILE) lets SQL Server optimize a statement for its current inputs at the cost of compiling it again. A local variable can lead to less specific estimates and a more generic plan.",
    question: "What trade-off do recompilation and generic estimates make?",
    walkthrough: "Recompilation lets the optimizer consider current inputs and sometimes simplify predicates at each execution, but consumes compile CPU and loses some reuse. Hiding a parameter behind a local variable can produce average or heuristic estimates that suit neither extreme. Estimate total system cost over frequency, including p99 latency for skewed inputs. Apply changes at statement scope when possible.",
    example: "A daily report can afford 50 ms of compilation to save seconds of execution. At 2,000 calls/s, even a few milliseconds of compile CPU per call may be unaffordable.",
    implications: "Compare compile CPU and execution savings at real call frequency. A generic plan that looks stable in a test may perform poorly at both extremes of a skewed distribution."
  },
  "sql-server__isolation-levels-incl-rcsi-snapshot": {
    overview: "Under read committed snapshot isolation, ordinary read-committed statements see a versioned snapshot per statement. Under snapshot isolation a transaction can retain a consistent snapshot across several statements.",
    question: "What can two reads inside one transaction see?",
    walkthrough: "Under RCSI, each ordinary read-committed statement sees committed versions appropriate to that statement’s start. Two statements in one transaction can therefore return different values if another transaction commits between them. Under snapshot isolation, reads generally reflect the transaction snapshot plus its own writes. Updating a row changed since that snapshot can produce an update conflict that needs a fresh transaction.",
    example: "T1 reads balance 10. T2 commits 20. T1 reads again. Under RCSI it can see 20; under snapshot it continues to see 10. Choose the level based on which behavior the report requires.",
    implications: "Pick the visibility guarantee the workflow needs. Long versioned reads consume version-store capacity, and snapshot write conflicts may require retrying the whole transaction."
  },
  "sql-server__locking-blocking-lock-escalation": {
    overview: "A reader waiting on a writer is blocking. Large transactions may acquire enough fine-grained locks for SQL Server to seek escalation, broadening the set of sessions affected.",
    question: "How do blocking, deadlock and escalation differ operationally?",
    walkthrough: "A blocking chain can make progress once the head transaction commits. A deadlock contains a cycle requiring a participant to be aborted. Escalation attempts to replace many fine-grained locks with a broader lock to manage lock overhead. Inspect head blockers, transaction age, objects and access order. Killing a session can initiate rollback that continues holding locks while undo runs.",
    example: "A session updates a large table then idles before commit. Hundreds of blocked reads can trace to that one open transaction. Fix transaction lifetime before assuming every waiting query needs a new index.",
    implications: "Identify the head blocker, its open transaction and the access path. Shorter batches and selective indexes can reduce lock footprint while preserving the required isolation."
  },
  "sql-server__why-with-nolock-is-dangerous": {
    overview: "NOLOCK permits read-uncommitted behavior. A report can include changes that later roll back, and concurrent movement can lead to missing or duplicated rows while scanning.",
    question: "Can NOLOCK still wait, and can its result be wrong?",
    walkthrough: "Read-uncommitted scans can read uncommitted data and produce inconsistent aggregates while concurrent changes move or modify rows. The hint also does not remove all locking, such as schema stability interactions. A “fast” finance report may count transactions that never became durable. If the problem is reader-writer contention, evaluate a suitable row-versioned reporting strategy and its storage cost.",
    example: "T1 inserts a large sale inside an open transaction. A NOLOCK report includes it. T1 rolls back. The report has already published revenue that never existed in committed data.",
    implications: "For an operational dashboard, define acceptable staleness and consistency. A row-versioned read or reporting replica can provide a coherent basis without silently counting uncommitted sales."
  },
  "sql-server__deadlocks-detection-prevention": {
    overview: "A deadlock graph identifies victims, owners, requested resources and statements in the dependency cycle. That evidence distinguishes inconsistent access order from a broad scan locking far more rows than expected.",
    question: "Which details in a deadlock graph suggest a fix?",
    walkthrough: "Read the resource ownership and wait edges for each process. Identify statements, indexes, isolation levels and transaction boundaries. Determine why each transaction still holds the first resource when it requests the second. Align resource order, narrow access paths or move non-database work outside the transaction. A retry addresses the victim’s transient failure while the graph explains why the cycle formed.",
    example: "If a scheduled job updates invoice then customer while checkout updates customer then invoice, both can succeed alone. Running them together under the opposite order exposes the cycle.",
    implications: "Arrange a common acquisition order, improve selective access and shorten transactions. Retain a bounded whole-transaction retry because rare cycles can remain under load."
  },
  "sql-server__tempdb-the-classic-contention-problem": {
    overview: "TempDB serves temporary objects, spills and some versioning workloads. Contention on allocation pages can show up as latch waits even when disk latency is low.",
    question: "What does a TempDB latch wait tell you that an I/O wait does not?",
    walkthrough: "A latch protects an in-memory page or structure during concurrent access. Allocation-page contention can increase latch waits without slow disk I/O. TempDB can also suffer ordinary read/write latency, capacity pressure, version-store growth or spills. Identify the resource and wait class first. File layout changes target only some of those causes and cannot correct a large join with a badly underestimated memory grant.",
    example: "Two incidents both show TempDB growth. In one, long-lived snapshots retain versions. In another, an underestimated sort spills repeatedly. Their fixes require different evidence despite the same disk filling up.",
    implications: "Identify the wait type and affected pages first. Appropriately sized equal data files can help allocation contention. A sort spilling large volumes needs a different remedy."
  },
  "sql-server__temp-tables-vs-table-variables": {
    overview: "A temporary table can have indexes and statistics that help optimize a later join. A table variable has different estimation and compilation behavior, which depends partly on compatibility level.",
    question: "How should you compare a temporary table and a table variable?",
    walkthrough: "Look at expected row counts, changes between executions, indexes and statistics needed for downstream joins, scope and transaction behavior. Deferred compilation can improve initial table-variable cardinality estimates under suitable SQL Server compatibility settings, but does not give them the same column distribution statistics as temporary tables. Test against both small and large intermediate results.",
    example: "A procedure sometimes builds five IDs and sometimes 200,000. Compare actual join types, memory grants, spills and plan reuse across alternating executions before choosing the shorter declaration syntax.",
    implications: "Compare actual plans with representative row counts. Decide using cardinality, reuse and indexing needs. Both structures can involve TempDB."
  },
  "sql-server__transaction-log-recovery-models": {
    overview: "The transaction log records changes needed for recovery and rollback. Recovery model affects which restore sequences are possible and how log space becomes reusable.",
    question: "Why can the log grow even though the database has free space?",
    walkthrough: "The log must retain records required for active transactions, recovery and configured replication or backup processes. Truncation marks internal log space reusable when dependencies allow; it does not necessarily reduce the file size. In full recovery, a broken backup routine can prevent the expected reuse and undermine recovery objectives. Inspect the reported reuse wait and oldest transaction before acting.",
    example: "A bulk update runs for two hours inside one transaction. Frequent log backups can succeed while its records still cannot be reused. Breaking future maintenance into safe batches can reduce peak log demand.",
    implications: "Under full recovery, schedule and verify log backups. A long transaction can delay reuse even with frequent backups. Investigate the reuse wait before growing or shrinking files."
  },
  "sql-server__table-partitioning": {
    overview: "Partition a large event table by month when retention requires retiring whole months. Aligned structures can make partition switching useful, and suitable predicates can eliminate irrelevant partitions.",
    question: "When does partition elimination actually occur?",
    walkthrough: "Partition boundaries let the optimizer identify which partitions can contain qualifying rows. A predicate on the partition key or a provable equivalent enables elimination. A query by unrelated customer ID may still require an access path across all partitions. For retention, switching a partition can avoid deleting millions of rows one by one, provided schema, indexes and boundary conditions are compatible.",
    example: "For a table partitioned by event month, compare a March date range with WHERE customer_id = @c alone. Check actual partition access in each plan before predicting the runtime benefit.",
    implications: "A lookup lacking the partition key may still visit many partitions. Partitioning helps lifecycle management but cannot replace the access index needed by that lookup."
  },
  "sql-server__fragmentation-rebuild-vs-reorganize-fill-factor": {
    overview: "Page splits and poor page density can increase reads and write work. Reorganizing incrementally adjusts an index, while rebuilding recreates it with greater resource and operational costs.",
    question: "How do fill factor and page density compete?",
    walkthrough: "A leaf page with spare room can accommodate some inserts without a split. That spare room also increases page count, memory use and scan cost. An append-only index with a monotonically increasing key behaves differently from one receiving random middle inserts. Choose fill factor per measured workload. Rebuilding can change statistics and density, so an improvement after rebuild does not isolate fragmentation as the cause.",
    example: "If a range scan reads 30% more pages after lowering fill factor, compare that cost with the reduction in page splits and write latency. Keep the setting only when the workload as a whole benefits.",
    implications: "Prioritize measured query impact and page density over a fixed fragmentation percentage. A lower fill factor leaves room for future inserts but increases the space scanned now."
  },
  "sql-server__backups-full-diff-log-point-in-time-restore": {
    overview: "Restore a full backup, optionally a matching differential, then the required log backups in sequence to the target time. The recoverable endpoint depends on a usable log chain and available backups.",
    question: "Can you restore to 10:17 after an accidental change at 10:18?",
    walkthrough: "Identify a usable full backup, a differential based on that full if applicable, and a continuous log chain through 10:17 under a suitable recovery model. Restore intermediate stages without recovery, apply logs up to the target, then recover and validate the database. Depending on the incident, a tail-log backup may preserve additional recoverable history. Store essential backups and keys outside the affected failure domain.",
    example: "During a drill, verify that a known 10:16 transaction exists and the 10:18 change does not. Measure the time until application queries work, including restoring logins, permissions and connectivity.",
    implications: "Rehearse the restore on another instance, time it and validate application data. A backup job reporting success says little about whether recovery meets the business deadline."
  },
  "sql-server__ha-dr-always-on-fci-log-shipping": {
    overview: "An availability group replicates selected databases between replicas. A failover cluster instance moves an instance using shared storage. Log shipping restores successive log backups on a secondary with some delay.",
    question: "Which failure does each SQL Server availability design cover?",
    walkthrough: "An availability group maintains database replicas and can offer readable secondaries and failover according to configuration. An FCI protects an instance through clustered failover but requires highly available storage and infrastructure. Log shipping is typically a delayed or warm recovery mechanism with manual or orchestrated promotion. Shared mistakes such as accidental deletes can propagate to replicas, so independent backups still matter.",
    example: "Simulate a failed database host and an accidental table deletion separately. A successful host failover can preserve the deletion perfectly. Recovery testing needs both failure classes and business-level data checks.",
    implications: "Choose using failure domain, recovery time, possible data loss and operational complexity. Test logins, jobs and client reconnection along with the database failover."
  },
  "sql-server__dmvs-wait-statistics-for-troubleshooting": {
    overview: "Wait statistics describe where sessions spend waiting time. DMVs can connect an active request to a blocker, query text or resource. Instance-wide totals accumulated over months can obscure today’s incident.",
    question: "How do you use waits without chasing the largest number?",
    walkthrough: "Measure wait deltas over the period in which the customer symptom occurs and relate them to active requests, blocking chains and resource metrics. A wait indicates where work paused, which may be downstream of the true limit. For example, slow clients can cause network-related waits while the database is able to produce rows quickly. Cumulative idle waits can dominate totals without affecting users.",
    example: "If request latency spikes at 14:00, capture waits and active requests around 14:00 and compare with a healthy interval. An instance-wide wait accumulated since last restart lacks that time relationship.",
    implications: "Compare deltas during the symptom and correlate them with request latency and resource metrics. A common wait can be normal for an idle background component."
  },
  "sql-server__set-based-operations-vs-cursors-rbar": {
    overview: "A single set-based update lets the optimizer choose how to join and modify qualifying rows. A cursor performing a query per row repeats execution overhead and can hold work open longer.",
    question: "Why can set-based code still need batching?",
    walkthrough: "Set-based SQL lets the optimizer choose access, join and update strategies over many rows, eliminating per-row round trips. A very large update can still produce long locks, log growth and expensive rollback. Break the set into deterministic ranges with a durable progress marker when atomicity across the entire dataset is unnecessary. Ensure a concurrent insert cannot cause skips or endless reprocessing.",
    example: "Backfill rows in primary-key order, updating only unfinished records. Commit each bounded range and record progress with the update. Restart from the last committed boundary and verify the final count.",
    implications: "Check the size of the resulting transaction. For a huge maintenance job, process bounded sets and record a restart point instead of issuing either one giant update or millions of tiny ones."
  },
  "sql-server__merge-upserts": {
    overview: "An upsert must handle two sessions both observing that a key is absent. A unique constraint is the final guard even when a single statement expresses insert-or-update intent.",
    question: "What does a correctness test for an upsert include?",
    walkthrough: "Use the database’s unique business key as the final invariant. Exercise simultaneous requests for the same absent key and concurrent updates to an existing key. For MERGE, reason about source uniqueness, match predicates, isolation and triggers; a single statement alone does not eliminate every race. A simpler conditional update/insert sequence may be easier to review if it explicitly handles duplicate-key conflicts.",
    example: "Two writers attempt to insert customer 71 with different profile values. Define whether the second should update, reject or preserve existing fields. “Only one row exists” is necessary but insufficient to specify the winning data.",
    implications: "For SQL Server, inspect MERGE semantics, concurrency behavior and target constraints for the chosen pattern. Test concurrent inserts of the same key and handle conflicts deliberately."
  },
  "sql-server__identity-vs-sequence": {
    overview: "IDENTITY generates values as rows are inserted into a particular table. A SEQUENCE is a separate object whose values can be requested before insertion or shared by several consumers.",
    question: "When are generated numbers consumed?",
    walkthrough: "A sequence can issue a number before there is an insert. An identity value is generated as part of insertion into its table. Allocation and caching can produce gaps even when no committed row bears the missing number. The highest generated number also does not necessarily indicate the last committed transaction because transactions can complete out of allocation order.",
    example: "T1 receives 101 and pauses. T2 receives 102 and commits. T1 rolls back. A report must not treat the absent 101 as proof of deleted data or order by ID as a strict commit chronology.",
    implications: "Neither promises gap-free business numbering. Rollbacks, allocation caching and failed operations can consume values. Enforce uniqueness separately and design audited numbering as its own requirement."
  },
  "sql-server__scalar-udf-performance-inlining-2019": {
    overview: "A scalar function called for every result row may hide substantial work. Eligible scalar UDFs can be inlined under suitable SQL Server settings, exposing their logic to ordinary optimization.",
    question: "How can you tell whether UDF inlining helped?",
    walkthrough: "Inlining can rewrite an eligible scalar function into relational expressions visible to the optimizer, potentially exposing joins, costs and opportunities for parallelism. Eligibility depends on the function and query context as well as database settings. Inspect actual plans and CPU time with realistic row counts. A cheap function on one row and the same function on 20 million rows are different problems.",
    example: "Compare a report calling a pricing function per line against a set-based equivalent. Verify identical results for nulls and rounding before treating an apparent performance gain as a valid replacement.",
    implications: "Inspect the actual plan to verify inlining occurred. Test with realistic row counts before replacing readable logic or assuming a version upgrade removed the cost."
  },
  "sql-server__ctes-window-functions": {
    overview: "A CTE names an intermediate query expression. A window function computes across related rows while retaining each row, useful for comparing a transaction with its account’s running total.",
    question: "How does a window frame change a running total?",
    walkthrough: "PARTITION BY restarts the calculation per account. ORDER BY defines the logical sequence. A ROWS frame can state exactly which preceding rows are included. Ties without a deterministic secondary key can make intermediate totals ambiguous, and the default frame may treat peers together. A CTE can name the intermediate rows before applying another filter or aggregation.",
    example: "SUM(amount) OVER (PARTITION BY account_id ORDER BY posted_at, id ROWS UNBOUNDED PRECEDING)\nFor two entries at the same time, the ID defines which intermediate balance appears first.",
    implications: "Specify deterministic ordering and the intended window frame. Reusing a CTE name does not guarantee SQL Server materializes its results once."
  },
  "sql-server__security-rls-tde-always-encrypted-roles": {
    overview: "Roles grant permissions, row-level security limits visible rows, TDE protects database files at rest, and Always Encrypted can keep selected column plaintext outside ordinary database-engine access.",
    question: "Which threat does each SQL security control address?",
    walkthrough: "Start with the actor. A stolen backup calls for encryption and key protection. A reporting login seeing another tenant’s rows calls for least privilege and a correct row policy. Columns that must remain protected from certain database operators may require client-side key ownership and compatible queries. Document who operates the application and can access decryption keys, since that changes the boundary.",
    example: "Grant a reporting role narrow read permission, test its tenant filter, then restore an encrypted backup in isolation using the recovery key procedure. These tests establish distinct guarantees.",
    implications: "Map each control to a specific reader and data path. TDE alone does not hide a salary from someone authorized to query it. Include keys, backups and administrative access in the design."
  },
  "sql-server__json-support-in-sql-server": {
    overview: "SQL Server can extract a scalar from JSON with JSON_VALUE and turn arrays into rows with OPENJSON. This is useful for optional attributes while stable relational keys remain explicit.",
    question: "When should a JSON attribute become a relational column?",
    walkthrough: "Use JSON for flexible, sparse attributes whose exact structure can evolve. If a field becomes a join key, needs a type constraint or is frequently filtered, promote it to a typed representation or expose an appropriate computed field and index. Distinguish missing, null and malformed values in ingestion. Treat a parsed string amount as a string until it is validated and converted.",
    example: "Two documents encode quantity as 2 and \"10\". A lexical comparison can sort them incorrectly for numeric work. Define the accepted schema and inspect how the query extracts and casts quantity.",
    implications: "Validate document shape where required. If a frequently filtered attribute becomes a bottleneck, consider a typed or indexed computed representation and measure its write cost."
  },
  "postgresql__how-mvcc-works": {
    overview: "PostgreSQL updates generally create a new tuple version. Each statement or transaction sees versions allowed by its snapshot, so ordinary readers can often proceed while writers change rows.",
    question: "What does a snapshot need to decide about a tuple?",
    walkthrough: "A tuple version records transaction visibility information for its creation and possible replacement or deletion. A snapshot identifies which transactions’ effects can be seen. Readers choose a version valid for their snapshot without ordinarily waiting for a writer to finish. Updating still coordinates conflicting writes, and obsolete versions consume space until cleanup is safe.",
    example: "Session A keeps a repeatable-read transaction open on price 10. Session B commits 12. A can keep seeing 10 while a fresh reader sees 12, so storage must preserve both versions for now.",
    implications: "Old snapshots can pin obsolete versions. Long-running transactions affect maintenance and storage even when their own reads appear cheap."
  },
  "postgresql__isolation-levels-serializable-ssi": {
    source: { title: "PostgreSQL transaction isolation", url: "https://www.postgresql.org/docs/current/transaction-iso.html" },
    overview: "PostgreSQL read committed can use a new snapshot per statement. Repeatable read retains a snapshot but can allow write skew. Serializable snapshot isolation tracks dependencies that could produce a nonserializable outcome.",
    question: "Why can PostgreSQL serializable abort transactions updating different rows?",
    walkthrough: "SSI tracks read/write dependencies that could form a dangerous serialization pattern. It can abort a transaction to preserve an outcome consistent with some serial execution, even when the conflicting writers target different rows. Repeatable read in PostgreSQL already prevents a changing snapshot and ordinary phantom reads, yet can allow write skew. Keep serializable transactions retryable from their first read.",
    example: "For the on-call roster, two transactions each read the roster and remove a different doctor. On serialization failure, rerun the whole decision. On retry the remaining doctor should observe that leaving would violate coverage.",
    implications: "Serializable transactions can abort even without a simple row-lock conflict. Retry the complete transaction from a fresh snapshot and keep external side effects outside the retry loop."
  },
  "postgresql__vacuum-autovacuum-table-bloat": {
    overview: "An updated PostgreSQL row leaves an old version until no relevant snapshot needs it. VACUUM makes dead space reusable and autovacuum schedules this work as the table changes.",
    question: "How do you diagnose a table growing faster than live data?",
    walkthrough: "Updates and deletes create versions that vacuum can reclaim only after they are no longer potentially visible. Compare live and dead tuple estimates, vacuum frequency, deletion or update rate and the oldest snapshot. Normal vacuum makes space available for reuse and can update visibility metadata. Continued file size after successful cleanup can be normal if later inserts reuse that space.",
    example: "A daily export holds an old snapshot for six hours while orders update continuously. Increasing vacuum frequency alone may achieve little until that snapshot releases the old versions it still needs.",
    implications: "Monitor dead tuples, long transactions and maintenance progress. Ordinary vacuum generally reuses space within the relation. Returning space to the filesystem is a separate operational decision."
  },
  "postgresql__transaction-id-wraparound": {
    overview: "PostgreSQL transaction identifiers have a finite range. Vacuum freezes sufficiently old tuple identifiers so very old committed rows remain correctly visible as the identifier space advances.",
    question: "Why does a quiet PostgreSQL table still need maintenance?",
    walkthrough: "Transaction IDs use wraparound-aware comparisons. Very old unfrozen tuples must be marked old enough to remain valid across future transaction-ID cycles. A table receiving almost no writes can age as other tables consume transaction IDs. Autovacuum therefore includes freeze-related maintenance independent of ordinary dead-tuple pressure. Monitor age relative to configured thresholds and identify old transactions preventing progress.",
    example: "A small reference table barely changes while the rest of a cluster processes millions of transactions. Its row count is a poor signal of freeze urgency. Inspect transaction age and successful vacuum progress instead.",
    implications: "Monitor transaction age, including quiet tables and databases. Investigate blocked maintenance or old transactions early because emergency anti-wraparound work can disrupt normal operations."
  },
  "postgresql__reading-explain-explain-analyze": {
    overview: "EXPLAIN reports the proposed PostgreSQL plan. EXPLAIN ANALYZE actually runs the statement and adds observed rows, loops and timing. Read row counts together with loop counts to understand repeated work.",
    question: "How do loops change the interpretation of EXPLAIN ANALYZE?",
    walkthrough: "PostgreSQL commonly reports actual rows and time as per-loop averages for repeatedly executed nodes. Multiply rows by loops to understand total output from such a node, while remembering parent node times include work performed below them. BUFFERS helps identify shared hits, reads and temporary activity. Compare estimated and observed cardinality before focusing on the final total time.",
    example: "An inner scan showing actual rows = 3 and loops = 50,000 produced roughly 150,000 rows in aggregate. A cheap-looking inner operation can dominate when invoked that frequently.",
    implications: "Include buffer information when distinguishing cache hits from reads. Exercise care with data-changing statements because analyzing execution performs their effects."
  },
  "postgresql__statistics-the-planner-analyze": {
    overview: "ANALYZE samples data to estimate distributions. If region and product are strongly correlated, separate column estimates can yield a poor estimate of the combined filter and an unsuitable join strategy.",
    question: "When can increasing the statistics target help?",
    walkthrough: "ANALYZE samples data and builds summaries such as most-common values and histograms. A larger statistics target can improve estimates for skewed or diverse values at additional analysis and planning cost. Extended statistics can model certain dependencies among columns. Choose the remedy based on the predicate whose estimate failed. Stale data distribution and correlated predicates call for different responses.",
    example: "A plan predicts 100 rows and reads 100,000 for city plus postal code. Compare estimates for each predicate separately and combined. If separate estimates are sound, correlation is a stronger candidate than globally stale statistics.",
    implications: "Compare estimated and actual rows at the first large divergence. Consider more relevant statistics or extended statistics for correlated predicates and recheck on representative values."
  },
  "postgresql__index-types-b-tree-gin-gist-brin-when": {
    overview: "B-tree indexes support common equality, range and ordering queries. GIN indexes components such as tokens, GiST supports specialized search operators, and BRIN summarizes ranges of physically adjacent blocks.",
    question: "How does an index type answer a particular operator?",
    walkthrough: "B-tree orders comparable scalar keys for equality and ranges. GIN indexes components of values, useful for membership and text search. GiST provides an extensible search structure for suitable operators such as spatial relations. BRIN summarizes groups of heap pages and discards ranges whose summaries exclude a match. The operator class connects query semantics to the index’s capabilities.",
    example: "For append-ordered timestamps, BRIN may reject most page ranges with a tiny index. For searching a token within many documents, inspect a GIN-supported operator and the number of candidates requiring rechecks.",
    implications: "Match the index operator class to the queries. BRIN can be tiny and effective for time-correlated append data but may prune little when physical order is random."
  },
  "postgresql__partial-expression-indexes": {
    overview: "A partial index can cover only active subscriptions. An expression index can support searches using a computed expression such as lower(email). Both narrow the work targeted by the index.",
    question: "What must match for an expression or partial index to be usable?",
    walkthrough: "The indexed expression must be suitably immutable and the query must use compatible expression semantics. A partial index has a predicate that limits membership; the planner needs to establish the query implies that predicate. An index on lower(email) speeds case-normalized lookup, while a unique index on that expression can also enforce a domain rule if that rule matches the chosen collation and normalization.",
    example: "For active subscriptions, index (customer_id) WHERE ended_at IS NULL. Compare the plan for a literal active-only query with a generic parameterized predicate that cannot prove the active-only condition at planning time.",
    implications: "Check that query predicates imply the partial condition and expressions match the indexed form. Include maintenance cost and collation semantics when reviewing a case-insensitive lookup."
  },
  "postgresql__covering-indexes-index-only-scans": {
    overview: "PostgreSQL can answer a query from indexed columns alone when visibility information permits it to skip checking heap tuples. INCLUDE can store projected values without making them search keys.",
    question: "Why can an index-only plan still access the heap?",
    walkthrough: "The index contains keys and included values, but PostgreSQL must determine tuple visibility for the querying snapshot. Pages marked all-visible in the visibility map can skip individual heap checks. Recent modifications can clear those bits. Vacuum can restore visibility information once safe. Coverage and visibility are two distinct requirements, which explains why the same query behaves differently on hot and archived partitions.",
    example: "Run EXPLAIN (ANALYZE, BUFFERS) on a closed billing period and on today’s frequently updated invoices. Compare Heap Fetches even when both use the same covering index definition.",
    implications: "Inspect heap fetches in the actual plan. A heavily updated table may still need many visibility checks even when every requested column is present in the index."
  },
  "postgresql__hot-updates-fillfactor": {
    overview: "A heap-only tuple update can link a new tuple version on the same page without creating new ordinary index entries when the update meets PostgreSQL’s eligibility conditions.",
    question: "Which updates are likely to qualify for HOT?",
    walkthrough: "The new tuple must fit on the same heap page and the changed columns must meet the engine’s index-related HOT eligibility conditions. Leaving some room with fillfactor raises the chance of same-page placement. The index can lead to the original tuple position and PostgreSQL follows the version chain to a visible tuple. Frequently updating indexed values often requires new index entries instead.",
    example: "For a table repeatedly updating a nonindexed last-seen field, compare HOT update ratio, table size and I/O at two fill factors. If every update changes a B-tree-indexed field, spare page space alone cannot solve the index churn.",
    implications: "Leave page space via fillfactor for frequently updated rows and inspect HOT update rates. Indexing a frequently changed column can undermine the benefit while lower fillfactor increases table size."
  },
  "postgresql__json-vs-jsonb": {
    overview: "PostgreSQL json preserves textual input, including formatting. jsonb parses it into a structured representation supporting efficient operations and suitable indexes, with different handling of order and duplicate object keys.",
    question: "What can change when converting json text to jsonb?",
    walkthrough: "json preserves the original representation, including whitespace and repeated keys. jsonb stores a parsed representation that normalizes object details, supports indexing and avoids reparsing for many operations. It is useful for containment and key-based queries but is unsuitable as the sole record of a byte-for-byte signed payload. Distinguish document equality from textual equality in your design.",
    example: "If a webhook signature covers the raw request bytes, verify and retain those bytes as required before transforming the payload. Store separately searchable jsonb fields for operational queries.",
    implications: "Use jsonb for searchable attributes and keep exact source text when textual fidelity matters. Promote strongly constrained, frequently joined fields into typed columns."
  },
  "postgresql__toast-arrays-composite-types": {
    overview: "TOAST can compress or move large variable-length values out of line, helping a row fit on a page. Arrays and composite values can represent bounded structures within a row.",
    question: "What costs remain when PostgreSQL moves large values out of line?",
    walkthrough: "TOAST can compress or store variable-length values outside the main heap row and leave a reference. Queries that avoid the large field can benefit, while extracting or modifying it may require reading and reconstructing substantial data. Arrays are convenient for bounded values but are harder to constrain or independently update element by element than child rows.",
    example: "A parent record contains 100,000 changing memberships in an array. Benchmark a single membership update and lookup against a child table with a unique (parent_id, member_id) key before adopting the compact-looking representation.",
    implications: "Updating one element in a large value can involve substantial rewriting. Normalize collections that need independent updates, joins or per-element constraints."
  },
  "postgresql__row-locks-advisory-locks-skip-locked": {
    overview: "Row locks coordinate changes to stored rows. Advisory locks coordinate an application-defined key by convention. SKIP LOCKED lets queue workers bypass already claimed rows and take other available work.",
    question: "How do you claim jobs without holding locks through external work?",
    walkthrough: "Use a short transaction to select ready rows with FOR UPDATE SKIP LOCKED and update their state and claim generation. Commit before executing slow external work. A lease or recovery process handles crashes after claiming. Advisory locks require every participant to follow the same convention and have session- or transaction-scoped lifetimes depending on the call.",
    example: "Worker A locks job 1. Worker B skips it and claims job 2. This improves worker throughput while giving up a strict global FIFO guarantee. Track how long job 1 remains unavailable.",
    implications: "Claim and persist the job state within a short transaction. Skipping rows gives an intentionally incomplete view and can starve long-contended jobs. Monitor their age."
  },
  "postgresql__deadlocks-in-postgres": {
    overview: "Two PostgreSQL transactions updating account rows in opposite order can wait on each other. The server detects the cycle and aborts a participant so the other transaction can finish.",
    question: "How can indexes influence a PostgreSQL deadlock?",
    walkthrough: "A write may acquire locks on several rows and interact with uniqueness checks or foreign-key references. Two statements that appear independent at a service level can therefore wait on each other indirectly. Inspect PostgreSQL’s deadlock report for participating transactions and statements. Define a stable ordering of affected account or business keys and keep transactions short.",
    example: "T1 updates account 4 then 8, T2 updates 8 then 4. PostgreSQL can abort one with SQLSTATE 40P01. Roll back the failed transaction and rerun the full transfer against current balances.",
    implications: "Inspect the conflicting statements, impose a consistent order and retry the aborted transaction. Ensure a failed transaction is rolled back before reusing the connection."
  },
  "postgresql__pgbouncer-connection-pooling-tuning": {
    overview: "PgBouncer lets many clients share fewer PostgreSQL server connections. In transaction pooling, consecutive transactions from one client can use different backends.",
    question: "Which assumptions break in transaction pooling?",
    walkthrough: "In transaction pooling the client can keep its connection to PgBouncer while successive transactions run on different backend sessions. Session-specific state may disappear or belong to a different underlying connection later. Features such as prepared statements depend on pooler configuration and protocol support, so check the actual deployment. Use transaction-scoped settings where possible and measure backends doing useful work.",
    example: "Acquire a session-level advisory lock through one transaction and assume the next transaction owns it. That design depends on backend affinity. Use a transaction-scoped alternative or a session-pinned connection when required.",
    implications: "Review dependencies on session state, temporary objects and advisory locks before choosing a pool mode. Size backend concurrency for database capacity and measure pool wait separately."
  },
  "postgresql__key-memory-tuning-parameters": {
    overview: "Shared buffers cache database pages. Work_mem budgets individual sort or hash operations, so many operations across concurrent workers can consume multiples of the configured amount.",
    question: "How can a small work_mem change exhaust a server?",
    walkthrough: "Work_mem applies to certain individual plan operations, and parallel workers and simultaneous queries can multiply memory use. It is neither a single global pool nor a flat allowance per connection. Shared buffers consume a separate shared budget, while the OS page cache and backend overhead also matter. Tune from observed sorts, hashes and spills under concurrent load.",
    example: "If 20 reports each run four memory-intensive sorts at once, a nominal 16 MB per sort implies roughly 1.25 GB of possible sort memory alone. Actual allocation depends on the plan and demand.",
    implications: "Diagnose spills and memory pressure together. A session-level adjustment for a reporting job can be safer than increasing the global budget for every concurrent query."
  },
  "postgresql__wal-checkpoints-durability": {
    overview: "WAL records changes before affected data pages must reach durable storage. Checkpoints establish recovery starting points and drive dirty-page writes, trading steady write work against restart replay time.",
    question: "How does WAL support crash recovery?",
    walkthrough: "Before a dirty data page can be written safely, the corresponding WAL records must satisfy write-ahead ordering. With ordinary durable commit settings, commit waits for the required WAL flush rather than every changed data page being written. After a crash the system can replay WAL from a recovery point. Checkpoints spread dirty-page writes and influence recovery time and I/O bursts.",
    example: "A transaction changes ten pages and commits. A crash occurs before all ten data pages reach disk. Recovery uses durable WAL to reconstruct committed effects within the configured durability guarantees.",
    implications: "Acknowledge commits according to the durability requirement. Monitor WAL volume and checkpoint pressure, and test recovery rather than inferring durability from low commit latency."
  },
  "postgresql__backups-pg-dump-vs-physical-pitr": {
    overview: "A logical dump reconstructs selected schema and data. A physical base backup combined with archived WAL can replay the cluster to a chosen time within the available recovery history.",
    question: "Which information is missing from a logical backup for PITR?",
    walkthrough: "A logical dump exports a consistent representation of selected objects and rows suitable for logical restore, but it is not a physical starting point for WAL replay. PITR needs a compatible physical base backup and continuous archived WAL through the desired target. Plan for timelines, configuration, keys and credentials needed to restart the recovered system. Verify archive continuity before an incident.",
    example: "Take a base backup on Sunday, archive WAL continuously and restore to Wednesday 14:03 in isolation. A gap early Tuesday prevents replay past that gap even if Wednesday’s WAL files are present.",
    implications: "Choose backup methods from the restore objective. Test a restore to just before a known transaction and verify WAL completeness, configuration and application access."
  },
  "postgresql__streaming-physical-vs-logical-replication": {
    overview: "Physical replication replays changes at the storage level and normally reproduces the cluster closely. Logical replication publishes selected table changes to subscribers and can support more selective migration patterns.",
    question: "What operational risks differ between physical and logical replication?",
    walkthrough: "Physical streaming transmits WAL changes for a cluster representation and is closely tied to engine compatibility. Logical replication sends changes for selected published tables using logical identities and requires care for schema evolution. Subscribers can lag or encounter conflicts. Replication slots help retain required WAL, which protects recovery but can consume significant storage when a consumer disappears.",
    example: "Pause a subscriber and measure retained WAL growth. Define a threshold, recovery procedure and data verification step for resynchronization before using a long-lived slot in production.",
    implications: "Plan for schema changes, replication identity and lag. An inactive replication slot can retain WAL on the source until storage fills, so monitor retained bytes."
  },
  "postgresql__declarative-table-partitioning": {
    overview: "Declarative partitions route rows by a defined key into child tables. For time-based data, pruning can avoid irrelevant partitions and detaching an old partition can simplify retention.",
    question: "What breaks when a partition has no matching boundary?",
    walkthrough: "An insert must route to a suitable partition or default partition. Missing a future range can fail writes at a calendar boundary. A default can absorb unexpected rows but may complicate attaching a new overlapping partition later. Partition pruning depends on the query exposing constraints the planner can use. Design primary or unique constraints to respect engine requirements across the partitioned table.",
    example: "Create next month’s partition ahead of time, insert a row exactly at midnight on the boundary, and insert a late row for last month. Verify routing, retention and expected index use for both.",
    implications: "Ensure future partitions exist and test late-arriving rows. A unique constraint on a partitioned table generally needs the partition key, which may affect the business key design."
  },
  "postgresql__create-index-concurrently-safe-online-changes": {
    overview: "CREATE INDEX CONCURRENTLY allows normal writes to continue during most of an index build by doing extra work and waiting for relevant transactions. It cannot run inside a normal transaction block.",
    question: "Why can a concurrent index build take longer and leave an invalid index?",
    walkthrough: "PostgreSQL performs extra phases and waits for transactions or snapshots so writers can proceed while the index is built and validated. Long-running transactions can delay completion even if CPU is idle. A failed concurrent build may leave an invalid index consuming space and potentially affecting write cost. Inspect catalog state before retrying or cleaning it up.",
    example: "Schedule a concurrent build while a long transaction is active. Inspect progress and blocking information, verify validity before enabling the intended query path, and confirm the migration runner did not wrap the command in a transaction.",
    implications: "Budget I/O, monitor long-running transactions and check index validity after a failed build. A migration runner that wraps everything in one transaction needs special handling for this step."
  },
  "postgresql__upsert-insert-on-conflict": {
    overview: "PostgreSQL ON CONFLICT uses a suitable unique constraint or index to resolve competing inserts. DO UPDATE can combine the existing row with values from the proposed row.",
    question: "What does ON CONFLICT arbitrate during a race?",
    walkthrough: "A unique index or constraint identifies the competing key. PostgreSQL coordinates the insert with concurrently inserting transactions, then chooses the specified conflict action. EXCLUDED refers to the proposed row in an update expression. Decide which columns may be overwritten and whether a conditional update is required to preserve a newer version. Key uniqueness alone says nothing about application event order.",
    example: "INSERT INTO counts(id, n) VALUES (1, 1) ON CONFLICT (id) DO UPDATE SET n = counts.n + 1\nTwo independent increments are preserved, but replaying one event still increments twice unless its event ID is deduplicated.",
    implications: "Specify the intended conflict key. A counter increment may be atomic and still double-count a retried business event. Deduplicate the event separately when retries are possible."
  },
  "postgresql__the-returning-clause": {
    overview: "RETURNING obtains values from the rows actually changed by an insert, update or delete. An application can receive a generated ID or updated balance in the same statement.",
    question: "Why return the value from the modifying statement?",
    walkthrough: "The statement already knows which rows actually changed, including generated values such as an identity. Returning those values avoids racing with another transaction between a write and a later lookup. It also avoids guessing which row belongs to the caller through a global maximum ID. With a conditional update, the returned set naturally communicates whether the condition matched.",
    example: "UPDATE stock SET available = available - 1 WHERE sku = $1 AND available > 0 RETURNING available\nOne returned row gives the remaining count from this successful reservation. No row means no reservation was made.",
    implications: "Inspect the returned row count for conditional updates. An empty result can mean the version check failed, avoiding a separate read that would introduce another race."
  },
  "postgresql__serial-vs-identity-vs-sequences": {
    overview: "SERIAL is shorthand that wires a column default to a sequence. IDENTITY makes generation part of the column definition and supports rules about whether callers may supply their own values.",
    question: "How do generated identity modes affect data imports?",
    walkthrough: "GENERATED ALWAYS restricts ordinary explicit assignments more strongly than GENERATED BY DEFAULT, which permits supplied values. Both use sequence machinery and can have gaps. Copying historical rows with explicit IDs does not necessarily advance the generator beyond the imported range. Check ownership, restart behavior and application assumptions when migrating schemas.",
    example: "Import IDs through 50,000 into an empty table, then insert a normal generated row in a test transaction. Verify its generated ID cannot collide with imported records before releasing application traffic.",
    implications: "Sequence allocation is separate from transaction commit, so gaps are normal. After a data import with explicit IDs, verify future generated values cannot collide with imported rows."
  },
  "postgresql__ctes-the-materialization-fence": {
    overview: "A PostgreSQL CTE can improve readability without necessarily materializing. Eligible side-effect-free CTEs may be folded into the outer query. Materialization can enable reuse but can also prevent predicate pushdown.",
    question: "When is a materialization boundary helpful?",
    walkthrough: "Folding an eligible CTE can let an outer predicate reach a base table and use an index. Materializing computes a result separately, which may avoid repeating an expensive expression across references but can force processing many rows later discarded. PostgreSQL version, volatility, recursion and reference count affect the rules. Choose explicit directives after comparing actual plans and semantics.",
    example: "An outer query needs one customer from a CTE describing every customer. Folding can enable a selective index lookup. A CTE computing an expensive deterministic value needed twice may benefit from one materialized result.",
    implications: "Compare plans where an outer filter is selective and where the subquery is reused. Choose explicit MATERIALIZED or NOT MATERIALIZED only with a reason grounded in actual work."
  },
  "postgresql__window-functions-distinct-on": {
    overview: "A window ranking can number each customer’s orders by date. Filtering to row one selects one representative per customer. PostgreSQL DISTINCT ON can express that common pattern more compactly.",
    question: "How do you choose between selecting one row and ranking every row?",
    walkthrough: "DISTINCT ON returns the first row per grouping key according to the query’s ordering. A window expression such as ROW_NUMBER computes a rank for every row and supports top-N per group by filtering the rank in an outer query. Both require an explicit tie rule for deterministic selection. Ties that must share rank instead call for RANK or DENSE_RANK.",
    example: "SELECT DISTINCT ON (customer_id) customer_id, id FROM orders ORDER BY customer_id, placed_at DESC, id DESC\nThe highest ID wins when two orders for the same customer share a timestamp.",
    implications: "Provide a deterministic tie-breaker such as order ID. With DISTINCT ON, align the leading order expressions with the grouping keys and then specify which row wins."
  },
  "postgresql__full-text-search": {
    overview: "PostgreSQL full-text search converts documents into searchable lexemes and matches them against a parsed query. A GIN index on a suitable tsvector supports efficient candidate lookup.",
    question: "How does a full-text query reach an indexed document?",
    walkthrough: "Convert source text into a tsvector using a chosen configuration that tokenizes, normalizes and possibly stems words. Convert the user’s query into a tsquery using matching language assumptions. The match operator tests candidate documents, and ranking can order the matches. GIN can accelerate candidate lookup, while relevance, phrase behavior and ranking still need evaluation on representative text.",
    example: "A search for “running” may match “runs” under an English configuration but behave differently under a simple configuration. Test common phrases, domain terms and stop words for the specific user population.",
    implications: "Use a language configuration consistent with the indexed document and the query. Test ranking and vocabulary on real examples because stemming and stop-word behavior affect relevance."
  },
  "postgresql__extensions-you-should-know": {
    overview: "Extensions add database capabilities, for example pg_stat_statements for aggregate query metrics, pg_trgm for similarity searches and PostGIS for spatial types and operators.",
    question: "How should a team adopt an extension safely and usefully?",
    walkthrough: "An extension packages database objects and sometimes native code under a versioned lifecycle. Determine which databases need it, which server settings or preload steps apply and which roles can operate it. Managed providers may expose a subset. Include extension availability and versions in migration and restore rehearsals so query plans and application behavior survive promotion or recovery.",
    example: "For pg_stat_statements, verify it is collecting representative query statistics and that reset intervals are understood. For pg_trgm, confirm the intended operator and index are used on real search strings.",
    implications: "Check provider availability, privileges and supported upgrade paths. Match each extension to an observed need and test backup restoration into an environment where it is available."
  },
  "postgresql__listen-notify-built-in-pub-sub": {
    overview: "LISTEN registers a session for a channel. NOTIFY sends a small signal that becomes visible after transaction commit. A disconnected listener can miss signals, so it works well as a wake-up mechanism.",
    question: "How do you avoid a missed wake-up when starting a listener?",
    walkthrough: "Establish LISTEN and commit that registration, then query the durable work table to catch up before waiting for new notifications. A transaction publishing work can insert its row and issue NOTIFY together so notifications become visible on commit. The payload is a signal to check durable state. Repeated signals, disconnects and reconnects must all lead to the same correct work scan.",
    example: "Worker disconnects after processing row 10 while rows 11–14 commit. On reconnect, scan for outstanding work first. Depending only on the next notification would leave the four already committed rows waiting indefinitely.",
    implications: "Store durable work in a table and let listeners query it after waking or reconnecting. This separates fast notification from the record of what still needs processing."
  },
  "distributed-systems-architecture__microservices-vs-modular-monolith-when-to-split": {
    overview: "Start with a boundary that has coherent data ownership and a reason for independent change. Modules in one deployment can enforce that boundary while preserving local calls and database transactions.",
    question: "Which boundary would actually support independent deployment?",
    walkthrough: "Map the write owner, transactions, schema consumers and release dependencies. A modular monolith can use explicit module APIs and separately owned tables to discover a domain boundary cheaply. Extracting it adds network timeouts, versioned contracts and distributed observability. A useful service can change or recover independently while maintaining a clear data contract. A shared database that every team edits may preserve all the old coupling.",
    example: "Before extracting billing, stop other modules from writing billing tables. Route those changes through its module API. If that change alone is impossible, moving the code to another process will expose the same unresolved ownership conflict.",
    implications: "Extract a service when independent scaling, release cadence or team ownership offsets network failure, observability and consistency costs. A service that must deploy in lockstep with its neighbors is a weak candidate."
  },
  "distributed-systems-architecture__event-driven-architecture-pros-cons": {
    overview: "Publishing OrderPlaced lets billing and fulfillment react independently. The publisher can finish without waiting for either consumer, while each consumer may temporarily see a different stage of the order.",
    question: "What does an event promise to its consumers?",
    walkthrough: "An event records a fact that already occurred. Its producer owns the meaning and version of that fact; each consumer owns its reaction and checkpoint. A command instead asks a responsible party to perform work. Publishing events broadens reuse, but replay, duplicates, missing context and evolving schemas become part of the contract. Keep enough immutable identifiers and facts to process historical events correctly.",
    example: "If OrderPlaced holds only an order ID, replaying yesterday’s event by fetching today’s order may produce a different invoice. Decide whether the event must capture agreed prices or refer to a versioned snapshot.",
    implications: "Design event identity, schema evolution and replay deliberately. Trace a single order through consumers and define how support sees a workflow that stalled halfway."
  },
  "distributed-systems-architecture__cqrs-event-sourcing-what-when-worth-it": {
    overview: "CQRS separates the models used to change state and to read it. Event sourcing stores a sequence of domain events as the authoritative history. They can be adopted independently.",
    question: "How does replay rebuild state without repeating external effects?",
    walkthrough: "With event sourcing, appending events to an aggregate stream typically checks the expected stream version to prevent lost updates. Fold the committed events in order to reconstruct state. CQRS read models consume changes and record their processing position. A projection rebuild should recompute data only. Sending receipts during replay would repeat side effects that belonged to live workflow execution.",
    example: "AccountOpened → Deposited(100) → Withdrawn(30) folds to balance 70. A new monthly-report projection can replay those events without requesting another withdrawal or emailing another statement.",
    implications: "An account statement may benefit from an event history and a fast balance projection. Budget projection rebuilds, schema evolution and the lag before a write appears in a read model."
  },
  "distributed-systems-architecture__saga-orchestration-vs-choreography": {
    overview: "A travel booking requires a flight and a hotel across independent systems. A saga records progress and uses compensating actions when later steps fail. An orchestrator directs the sequence, while choreography distributes reactions among participants.",
    question: "How does a saga recover when a compensation fails?",
    walkthrough: "Record the workflow state and the stable identity of each step. On timeout, reconcile the step before trying again if its outcome is ambiguous. A compensation is a new domain operation that can itself fail, be delayed or require human intervention. Orchestration centralizes that decision history. Choreography requires well-defined event contracts and enough correlation to reconstruct progress across participants.",
    example: "Flight reserved, hotel refused, cancellation request timed out. The saga should expose “flight cancellation pending,” retry with the same reference and escalate if the refund deadline approaches.",
    implications: "Compensation has business meaning. Cancelling a reservation may incur a fee. Persist transitions and make forward and compensating actions safe to retry."
  },
  "distributed-systems-architecture__cap-theorem-in-practical-terms": {
    overview: "During a network partition, two isolated replicas cannot both accept every request and guarantee that all clients observe the latest single value. A system must decide which operations wait or fail.",
    question: "What exactly counts as availability in CAP?",
    walkthrough: "CAP’s availability condition concerns requests received by non-failing nodes during a partition. Linearizable consistency requires operations to appear in a single order respecting real-time completion. Two disconnected sides cannot independently accept incompatible writes and both guarantee that order. A system can choose different behavior for different operations, and the theorem does not require sacrificing normal-case availability whenever the network is healthy.",
    example: "Partition a two-region store after balance 10 is replicated. Both sides receive a request to spend 8. Independent success on both violates the balance invariant. One side must coordinate, reject, defer or rely on preallocated spend rights.",
    implications: "Separate browsing from spending a gift-card balance. A stale description may be acceptable while two independently accepted withdrawals can violate the balance invariant."
  },
  "distributed-systems-architecture__two-phase-commit-why-avoided-eventual-consistency": {
    overview: "Two-phase commit asks participants to prepare, then coordinates a common commit decision. After preparing, participants may have to retain resources while waiting for an uncertain outcome to be resolved.",
    question: "What is the difficult point in two-phase commit?",
    walkthrough: "During prepare, each participant durably records whether it is ready to commit and may retain locks or other resources. After all prepare, the coordinator durably decides commit or abort and communicates that outcome. A prepared participant losing access to the decision cannot safely guess. This coordination can be justified inside a controlled transactional system but becomes difficult across independent services with different availability goals.",
    example: "Inventory prepares and payment prepares. The coordinator records commit, then crashes before notifying inventory. Inventory needs a recovery path to the durable decision; timing out and unilaterally aborting could contradict payment’s commit.",
    implications: "When the business permits intermediate states, local commits plus durable events and compensation reduce cross-service coupling. State how long inconsistency can last and how abandoned work is repaired."
  },
  "distributed-systems-architecture__monolith-service-migration-strangler-fig-anti-corruption-layer": {
    overview: "Route a bounded operation from the monolith to a new service while other traffic still follows the old path. An anti-corruption layer translates the old model into the new service’s terms.",
    question: "How do you cut over writes without creating two sources of truth?",
    walkthrough: "Choose one use case, define its contract and identify the one writer at each migration phase. Backfill existing data, replicate or replay incremental changes, verify completeness and equality, then switch routing under an explicit handoff. An anti-corruption layer translates legacy concepts such as overloaded status flags into the new domain vocabulary. Plan rollback for new writes received after cutover.",
    example: "Compare old and new read responses in shadow mode first. After the new service owns writes, routing traffic back to the old service is safe only if it has received or can reconcile those newer writes.",
    implications: "Name the authoritative writer during every migration stage. Compare outputs and retain a rollback route that accounts for writes already accepted by the new system."
  },
  "distributed-systems-architecture__distributed-rate-limiting-resilience": {
    overview: "Four replicas each enforcing a hundred requests per second can collectively admit four hundred. A shared atomic limiter can enforce a fleet-wide quota, at the cost of a dependency on its latency and availability.",
    question: "How would you design a quota under partial failure?",
    walkthrough: "A shared token bucket needs an atomic replenish-and-consume operation, a consistent policy for time and a key that represents the quota owner. Reaching a global store on every request increases latency and couples availability. Leasing small token blocks locally trades strict precision for fewer calls. Define who absorbs risk during an outage and how budgets are renewed across instances.",
    example: "Grant ten replicas ten local tokens each. Up to a hundred already granted tokens remain spendable if the central service stops granting new ones. Choose the grant size from allowable overshoot, not just throughput.",
    implications: "Consider leasing small local budgets to reduce coordination. Specify how much overshoot is acceptable and what each feature does when it cannot reach the quota store."
  },
  "system-design-fundamentals__how-to-approach-any-system-design-question": {
    overview: "Start a design discussion with one concrete user operation and the guarantee it needs. For example, clarify whether a newly posted message must appear immediately on the sender’s second device.",
    question: "How do you turn vague requirements into design decisions?",
    walkthrough: "Clarify the user-visible operation, scale, latency percentile, durability, consistency and the consequence of failure. Sketch an API and core data ownership before picking storage products. Walk one write and one read through the design. Estimate the dominant resource, identify its failure mode, then evolve only the component under pressure. Tie each added queue, replica or cache to an observable requirement.",
    example: "For a booking system, “reserved seats must never be sold twice” drives the write boundary. A stale seat map might be acceptable, but the final reservation needs an atomic claim. That distinction can simplify most reads.",
    implications: "Sketch the simplest write and read paths, estimate their load, then stress the costliest dependency or strongest invariant. State how you would observe and recover from its failure."
  },
  "system-design-fundamentals__back-of-the-envelope-estimation": {
    overview: "One hundred million reads per day averages roughly 1,160 per second. A tenfold peak and a 10 KB response imply roughly 116 MB per second of peak response payload before overhead.",
    question: "How do you convert business scale into storage and bandwidth?",
    walkthrough: "Separate daily users from events per user and divide by 86,400 to estimate average requests per second. Multiply by a stated peak factor and payload size for a bandwidth estimate. For storage include retention, replication, indexes and working space. Track bytes versus bits explicitly. A rough range is more defensible than a precise number built from uncertain inputs.",
    example: "One million daily 2 KB events retained for 30 days use about 60 GB raw in decimal units. Three copies raise that to 180 GB before indexes, logs, compression and recovery headroom.",
    implications: "Keep units visible and distinguish peak from average. Vary the two least certain assumptions to see whether they actually change the architecture decision."
  },
  "system-design-fundamentals__vertical-vs-horizontal-scaling": {
    overview: "Vertical scaling increases capacity of one node and can preserve simple local coordination. Horizontal scaling distributes work across nodes but requires routing and handling node loss or uneven load.",
    question: "Why can throughput stop scaling after adding application instances?",
    walkthrough: "Total throughput is constrained by the most saturated shared resource. More stateless replicas reduce per-instance work and can improve availability, but they also create more pool connections and concurrent writers. Vertical scaling may buy immediate headroom while preserving a simple architecture. Horizontal scaling needs partitionable work, coordination and a rebalancing or routing strategy. Test failure headroom as well as steady-state capacity.",
    example: "Four instances each support 100 requests/s, but SQL sustains 250 writes/s. If every request writes once, eight instances still cannot exceed the SQL limit and may increase queuing.",
    implications: "Identify what can be split. Stateless request handlers scale out easily until a shared database saturates. Adding more callers can make that bottleneck worse."
  },
  "system-design-fundamentals__multi-layer-caching-browser-cdn-app-redis-db": {
    overview: "A browser can reuse one user’s response, a CDN can serve many nearby readers, an app can cache computed values and Redis can share results across app replicas. Each layer has its own cache key and expiry.",
    question: "Which layer should invalidate when a public document changes?",
    walkthrough: "List each cache’s key, owner, expiration and invalidation mechanism. An origin change may invalidate an application cache but leave a CDN object valid and a browser response fresh. Versioned asset URLs avoid chasing immutable content through layers. Mutable resources can use freshness bounds, validators or purges with measured propagation delay. Ensure personalization enters every relevant key or prevents shared caching.",
    example: "Publish app.abc.js and reference it from revalidated HTML. The immutable asset can have a long browser and CDN lifetime, while replacing the HTML reference controls rollout. Reusing one immutable URL for different bytes breaks that model.",
    implications: "Trace a content update through every layer. Clearing Redis does little if an edge still serves the old response. Keep private responses outside shared cache entries."
  },
  "system-design-fundamentals__sql-vs-nosql-how-to-choose": {
    overview: "Begin with data access and invariants. A ledger with multi-row constraints and ad hoc reconciliation queries fits a relational model. A predictable key-based workload may suit a partitioned key-value store.",
    question: "How do you choose a data model from access patterns?",
    walkthrough: "Write down the primary read and write shapes, transaction boundaries, required joins, scale distribution and operational capabilities. Model one invariant that must never break and one query whose shape is likely to evolve. A relational model can combine SQL, indexes and transactions; a partitioned document or key-value store can excel when access is predictable and colocated. Product names alone do not establish consistency guarantees.",
    example: "For orders and lines updated together, one document may work. A cross-order financial reconciliation across changing dimensions may justify a relational or analytical projection even if the transactional write model stays document-oriented.",
    implications: "Test the hardest transaction, query and repartitioning requirement. Choosing a document database for flexible fields can become costly if every important read requires cross-document joins."
  },
  "system-design-fundamentals__quorum-r-w-n": {
    overview: "With three fixed replicas, writing to two and reading from two guarantees the sets intersect. To return the newest accepted value the read protocol must interpret versions and handle competing writes correctly.",
    question: "What information does a quorum read actually recover?",
    walkthrough: "With N fixed replicas, a completed write to W and a read from R overlap if R + W > N. Overlap guarantees some common replica, subject to the same membership and completion assumptions. A reader still needs a version selection protocol and rules for concurrent writes. Sloppy quorums or changing membership can invalidate a simple set-intersection argument. Atomicity across keys is a separate property.",
    example: "N=3, W=2, R=2. Write reaches A and B. A read from B and C sees at least B’s version. If two clients propose conflicting versions, intersection alone does not tell the system which business outcome wins.",
    implications: "Quorum overlap by itself does not guarantee linearizability. Discuss concurrent writes, failed operations and whether the system uses substitute replicas during outages."
  },
  "system-design-fundamentals__cap-pacelc-per-feature-consistency": {
    overview: "CAP describes the choice during partition. PACELC also asks what latency a system pays for stronger consistency while communication works. A cross-region synchronous write illustrates that everyday cost.",
    question: "How would PACELC change an ordinary-day design decision?",
    walkthrough: "Even without a partition, synchronously coordinating writes between distant regions adds network delay to the critical path. Serving local reads can reduce latency but may expose older data. During a partition the decision becomes whether to keep serving operations that could violate the required consistency. Specify those choices per feature and measure their user-visible consequences instead of assigning one slogan to the entire product.",
    example: "Show approximate likes immediately from the closest region. Require a coordinated decision for consuming the final voucher. The same system can choose distinct latency and partition behavior for these two operations.",
    implications: "Set expectations per feature. A stock reservation may justify coordination, while an approximate popularity count can accept local writes and later reconciliation."
  },
  "system-design-fundamentals__consistent-hashing-hot-partitions": {
    overview: "Consistent hashing assigns ranges in a hash space so a membership change moves a subset of keys. Virtual nodes can improve distribution across machines.",
    question: "How does consistent hashing affect placement when membership changes?",
    walkthrough: "Map nodes and keys into a hash space and assign each key to its next owner on the ring under one convention. Adding a node transfers ownership of particular ranges, leaving others in place. Virtual nodes distribute ranges across physical machines and help balance uneven capacities. This controls how many keys move; it does not guarantee balanced request rates when key popularity is skewed.",
    example: "If one user generates half the traffic, uniformly distributing a million user IDs can still put half the traffic on one shard. Split that user’s work only if the required operations tolerate the new boundary.",
    implications: "Hashing spreads many keys but cannot divide a single extremely popular key. Inspect per-key traffic and add replication, caching or a different key design for skew."
  },
  "system-design-fundamentals__designing-for-high-availability-the-9s": {
    overview: "A 99.9% monthly time-based objective permits about 43 minutes of unavailability in a 30-day month. Several mandatory dependencies can consume that budget quickly, especially when failures are correlated.",
    question: "How should you calculate and spend an availability budget?",
    walkthrough: "Define the SLI, denominator, observation window and what counts as a good event. Time-based uptime and request success can tell different stories during peak traffic. For a required serial path, independent component availabilities multiply under simplifying assumptions; shared failures make independence unreliable. Include retries, degraded responses and surviving capacity in a user-facing measurement.",
    example: "For 10 million eligible requests at 99.9% success, the error budget is 10,000 failed requests. Losing 5,000 during a short peak consumes half the budget even if the outage barely registers on a monthly time chart.",
    implications: "Define success from the client’s perspective and exercise failover under load. Redundancy only helps when surviving capacity, routing and recovery procedures work together."
  },
  "system-design-fundamentals__multi-region-dr-rpo-rto": {
    overview: "RPO bounds acceptable data loss measured in time. RTO bounds time to restore service. A daily backup might support a long RPO even if restoring it is fast.",
    question: "How do you measure recovery objectives rather than infer them?",
    walkthrough: "Record the last durable business event recoverable at the target and the time clients can complete a representative transaction there. Compare the first with incident time for data loss and the second with incident start for restoration time. DNS, credentials, queues, encryption keys and downstream providers can all extend recovery beyond database promotion. Rehearse failback as well as failover.",
    example: "A region fails at 12:00. Restored writes end at 11:56 and checkout succeeds at 12:19. Observed data loss is four minutes and observed service recovery is nineteen minutes, regardless of when the replica became reachable.",
    implications: "Walk through a regional loss, including detection, authority transfer, data recovery and traffic movement. Measure both the latest recovered write and the time real clients can complete requests."
  },
  "system-design-fundamentals__backpressure-load-shedding": {
    overview: "When arrivals exceed service capacity, unbounded queues turn excess load into memory use and increasingly stale responses. Backpressure signals producers to slow down. Load shedding rejects selected work early.",
    question: "How should a system choose which work to shed?",
    walkthrough: "Separate critical transactions from optional refreshes and apply admission control before consuming the scarce dependency. A bounded queue absorbs a short burst but increases time in system. Reject or degrade work whose deadline will likely expire before service starts. Tell cooperative producers how to back off, and avoid encouraging synchronized retries that refill the queue immediately.",
    example: "At 100 jobs/s service capacity, 1,000 queued jobs imply about ten seconds before a new FIFO job starts. A two-second request deadline makes accepting that job wasteful unless priority or capacity changes.",
    implications: "Reserve capacity for critical requests and bound waiting by deadlines. Monitor successful throughput and queue age because accepting more requests can reduce useful completions."
  },
  "system-design-fundamentals__push-vs-pull-websockets-sse-long-polling": {
    overview: "Polling repeatedly asks for changes. Long polling holds the request until an update or timeout. SSE offers an HTTP server-to-client stream, while WebSockets allow both endpoints to send messages over a persistent connection.",
    question: "What work shifts to the server when you choose push?",
    walkthrough: "Polling uses simple short requests but repeats empty reads and trades freshness for interval. Long polling holds pending requests until an event or timeout. SSE and WebSockets require managing persistent connections, reconnects and fan-out. WebSockets provide bidirectional messaging; SSE suits server updates over HTTP. Choose heartbeat, idle timeout and replay semantics compatible with the actual load balancer and client.",
    example: "With 100,000 clients polling every five seconds, the server handles about 20,000 polls/s even when nothing changes. Persistent connections reduce empty polls but still consume file descriptors, memory and reconnect capacity.",
    implications: "Choose using update frequency, direction and reconnect needs. Assign event IDs and a recovery path when losing a live connection must not lose the user’s data."
  },
  "system-design-fundamentals__bloom-filter-what-when": {
    overview: "A Bloom filter sets several bits for each inserted key. An unset required bit proves absence under the filter’s assumptions. All bits set means the key may exist and merits an authoritative lookup.",
    question: "Why can a Bloom filter say “maybe” but not prove presence?",
    walkthrough: "Each key maps to several bit positions. Insertion sets those bits, which may already have been set by other keys. A zero in any required position proves the key was not inserted into that correctly maintained filter. All ones can result from collisions. Increasing inserted items at fixed filter size raises the false-positive rate. Deleting by clearing shared bits can create false negatives.",
    example: "If one million absent requests encounter a filter with a 1% false-positive rate, about 10,000 may still hit storage. Keep the authoritative check on positives and rebuild or update the filter consistently with real inserts.",
    implications: "Size the filter for expected insertions and false-positive cost. A stale filter missing recent inserts can incorrectly suppress a real lookup even if the data structure itself behaves correctly."
  },
  "system-design-fundamentals__distributed-unique-id-generator-snowflake": {
    overview: "A Snowflake-style ID combines time, worker identity and a counter, allowing independent workers to generate roughly time-ordered identifiers without a database round trip per ID.",
    question: "How do you allocate and validate an ID bit budget?",
    walkthrough: "Reserve bits for timestamp since a chosen epoch, node identity and sequence within a time unit. More sequence bits allow higher per-node bursts but reduce another dimension in a fixed-width ID. Persist or coordinate worker identities across recycling and define clock rollback behavior. A monotonic sequence within one worker and time tick does not give global causal order across skewed machines.",
    example: "With 12 sequence bits a worker has 4,096 sequence values per millisecond. After exhausting them it must wait for the next tick or follow another safe allocation policy; wrapping in place can duplicate IDs.",
    implications: "Allocate worker identities uniquely and define behavior for clock reversal and counter exhaustion. Ordering across machines reflects clock assumptions and cannot establish a strict causal history."
  },
  "system-design-fundamentals__when-to-put-a-message-queue-in-the-design": {
    overview: "If a report takes thirty seconds, accept the request, persist a job and return a status identifier. A queue lets workers absorb a temporary burst at a controlled rate.",
    question: "Which guarantees must be established at the enqueue boundary?",
    walkthrough: "Define whether acknowledging the API means the request is durable, merely accepted in memory or already processed. If creating a job row and publishing a message are separate writes, use an outbox or an equivalent recoverable handoff. Choose ownership of retries, worker concurrency and dead-letter handling. Expose job status so callers can distinguish pending, running, completed and failed work.",
    example: "A report request returns a job ID just before the host crashes. On restart the client should still find either durable pending work or a truthful terminal outcome. An in-memory queue alone cannot deliver that promise.",
    implications: "Design deduplication, retention, cancellation and progress reporting. An indefinitely growing queue signals insufficient capacity or an overly broad acceptance policy."
  },
  "data-sharding-partitioning-replication__sharding-choosing-a-shard-key-avoiding-hotspots": {
    overview: "A tenant-based shard key keeps one tenant’s data together, which makes many queries local. A single very large tenant can still dominate one shard even if tenant counts look balanced.",
    question: "Which properties make a shard key sustainable?",
    walkthrough: "Evaluate cardinality, distribution, growth, request locality and whether the key is known at routing time. Colocate records that transact together and avoid monotonically creating all hot writes in one range. Measure the heaviest individual key, not only average shard size. Composite keys can split a large tenant, but queries or transactions spanning its buckets then require extra coordination.",
    example: "If a tenant owns 40% of all writes, hashing tenant_id across 100 shards still sends that tenant to one shard. Hashing (tenant_id, order_bucket) can distribute work at the cost of tenant-wide fan-out.",
    implications: "Analyze bytes, writes and peak traffic per key. Plan an escape route for outliers, such as splitting a tenant by a secondary key where its transactions allow that split."
  },
  "data-sharding-partitioning-replication__partitioning-range-vs-hash-vs-directory-horizontal-vs-vertical": {
    overview: "Range partitioning supports locality for ordered scans, hash partitioning spreads many independent keys, and a directory explicitly maps keys to locations. Horizontal partitioning divides rows, while vertical partitioning divides fields or related groups.",
    question: "How do you compare the routing and rebalancing costs?",
    walkthrough: "Range partitioning can answer a contiguous interval by contacting selected owners but may concentrate recent writes. Hashing usually spreads many keys more evenly while scattering range scans. Directory routing allows explicit placement and tenant moves at the price of a highly available mapping service and cache invalidation. Vertical partitioning separates groups of columns or functions with different access or protection needs.",
    example: "Keep bulky immutable attachments apart from frequently edited message headers. That vertical split reduces update volume. Distributing message rows across customer shards is a separate horizontal decision and can be applied as well.",
    implications: "Use the dominant access path as a test. An ordered time key can simplify retention yet route nearly all new writes to the latest range."
  },
  "data-sharding-partitioning-replication__replication-leader-follower-synchronous-vs-asynchronous": {
    overview: "A leader orders writes and followers replay them. Waiting for replication before acknowledging can reduce potential data loss, while asynchronous acknowledgement typically reduces write latency.",
    question: "Where should the acknowledgement sit on a replicated write?",
    walkthrough: "A leader can acknowledge after its own durable write, after a follower receives log bytes, after the follower flushes them or after the follower applies them. Those are distinct promises with different latency, availability and read freshness. Synchronous replication can delay writes if required replicas are unreachable. Asynchronous replication can lose recently acknowledged writes during failover.",
    example: "A follower has flushed entry 91 but its read model has applied only through 89. That copy may protect durability of 91 while a query served immediately from it still returns the older value.",
    implications: "Specify what “replicated” means for the chosen system, such as received, durably flushed or applied. A replica can have received a change before a query there can observe it."
  },
  "data-sharding-partitioning-replication__replication-topologies-single-leader-multi-leader-leaderless": {
    overview: "Single-leader replication centralizes write order. Multi-leader accepts writes at several leaders and needs conflict handling. Leaderless systems distribute coordination across replicas and often use quorums and repair.",
    question: "How do competing writes get resolved in different topologies?",
    walkthrough: "A single leader can order conflicting writes at one point, though failover still needs fencing. Multi-leader deployments can accept geographically local writes, then need a domain rule to reconcile conflicts. Leaderless systems can use quorums, version metadata, read repair and background repair. Last-write-wins depends on a chosen time or order and can silently discard a valid concurrent business operation.",
    example: "Two regions update different fields on one profile while disconnected. Whole-document last-write-wins can lose one field. Field-level merges may work for preferences but require different reasoning for a bank balance.",
    implications: "Walk through two clients updating the same field during disconnection. Pick a conflict outcome the domain can tolerate before choosing the topology."
  },
  "data-sharding-partitioning-replication__read-replicas-replication-lag-read-your-writes": {
    overview: "A user updates a profile and immediately reloads it from a lagging replica. The old name looks like a failed save even though the primary committed successfully.",
    question: "Which session guarantees matter beyond one read-after-write?",
    walkthrough: "Read-your-writes lets a caller see its own committed change. Monotonic reads prevent later reads moving backward after the caller saw a newer version. A client switching among lagging replicas can violate either guarantee. Attach a version or log-position floor to the session and route to a replica meeting it, wait within a budget or fall back to the leader.",
    example: "Read version 12 from replica A, then route to B at version 10. Even without a recent client write, showing version 10 reverses observed history. Carrying “at least 12” can avoid that regression.",
    implications: "Route that user’s read to the primary or wait for a replica to reach the write position. A fixed delay is only a heuristic and breaks under unusually large lag."
  },
  "data-sharding-partitioning-replication__rebalancing-resharding-with-consistent-hashing": {
    overview: "Adding a node to a hash ring changes ownership of certain ranges. Existing data in those ranges must be moved while reads and writes continue. The routing algorithm alone does not transfer any bytes.",
    question: "How do you migrate a live range without dropping updates?",
    walkthrough: "Create the target range and copy a consistent snapshot. Capture updates occurring during the copy, replay them through a known position and verify the destination. Publish a new routing epoch and reject stale writes or forward them through a controlled transition. Retain the old copy until clients and recovery procedures can safely stop using it. Data movement competes with live traffic for I/O.",
    example: "An order changes after its row was copied but before routing switches. A successful row-count comparison will miss the stale value. Verify versions or checksums and the change-stream checkpoint before transferring write authority.",
    implications: "Version routing metadata, copy data, catch up concurrent writes and cut over with verification. Throttle movement so rebalancing does not starve live traffic."
  },
  "data-sharding-partitioning-replication__consistency-failover-split-brain-fencing": {
    overview: "A network partition can leave an old primary alive while another is promoted. Both may believe they can write, causing divergent histories. Failure detection alone cannot revoke the old writer’s authority.",
    question: "What is the difference between suspecting failure and granting authority?",
    walkthrough: "Health checks cannot distinguish every crashed leader from a live but disconnected leader. Promotion must be tied to an authority such as a consensus quorum or a properly specified lease. Only the current epoch should be allowed to commit externally visible changes. Fencing at storage or another authoritative destination prevents delayed old writes from undoing newer ones. Routing changes alone do not revoke old credentials or packets.",
    example: "After promoting B, deliberately restore connectivity to old leader A with buffered work. Verify storage rejects A’s old epoch and that clients cannot accidentally recognize both leaders as authoritative.",
    implications: "Use a quorum-based authority and enforce epochs or fencing at the write destination. Test a delayed old primary returning after failover, not just an abruptly terminated one."
  },
  "data-sharding-partitioning-replication__cross-shard-queries-joins-distributed-transactions": {
    overview: "Joining order and customer data on different shards may require fan-out, network transfer and merging. A transaction updating both shards additionally needs a protocol for partial failure.",
    question: "How does fan-out change tail latency and correctness?",
    walkthrough: "A global query contacting many shards often waits for the slowest required response, then merges results under a defined ordering. Cross-shard joins may require shipping data or maintaining denormalized projections. A cross-shard write can commit on only some participants unless there is a coordination protocol or compensating workflow. Keep related invariants together when a realistic partition key allows it.",
    example: "To return the latest ten events across twenty shards, fetch up to ten locally ordered candidates per shard, then merge globally with deterministic tie-breaking. Define whether one unavailable shard yields a partial result or an error.",
    implications: "Co-locate data for critical invariants where possible. For read-heavy screens, build a projection. For multi-shard writes, state whether atomic coordination or compensation fits the business promise."
  },
  "data-sharding-partitioning-replication__table-partitioning-in-practice-sql-server-postgres": {
    overview: "In either SQL Server or PostgreSQL, partitioning an event table by date can simplify retention and prune scans when predicates constrain dates. The engines differ in index management and partition maintenance commands.",
    question: "How do you choose a time-partition size?",
    walkthrough: "Start with retention operations, rows per interval, typical query range and maintenance windows. Monthly partitions may simplify lifecycle management for years of data while daily partitions may be better for short retention and high ingestion. Too many partitions can increase planning and maintenance overhead. Compare how each engine handles boundaries, aligned indexes, unique constraints and online maintenance.",
    example: "Before dropping the oldest partition, test an event arriving late and an active query spanning the boundary. Confirm retention policy, archive availability and application expectations for both engines in use.",
    implications: "Rehearse adding the next partition, retiring an old one and querying across a boundary. Verify pruning in the actual plan and account for uniqueness requirements on partitioned keys."
  },
  "load-balancing-reverse-proxy-api-gateway__load-balancer-layer-4-vs-layer-7-algorithms-round-robin-least-conn-has": {
    overview: "A layer-four balancer routes transport connections. A layer-seven balancer can inspect application requests and route by host or path. Round robin fits similar backends, while least-connections or hashing serve different load and affinity needs.",
    question: "How should the balancing algorithm match request cost?",
    walkthrough: "Round robin approximates fairness when requests cost similar amounts. Least-connections can help with long-lived connections but one multiplexed connection may carry thousands of requests. Hashing can improve cache locality or session affinity while concentrating hot clients. Layer seven can use application metadata at the cost of understanding the protocol and often terminating TLS. Evaluate balance by useful work as well as connection counts.",
    example: "One gRPC client sends 80% of requests through one connection. A TCP balancer cannot split that connection across servers. Per-RPC balancing or multiple appropriately managed channels may distribute the work more effectively.",
    implications: "Check the unit being balanced. One long-lived multiplexed connection can carry much more work than many short ones, making equal connection counts misleading."
  },
  "load-balancing-reverse-proxy-api-gateway__reverse-proxy-tls-termination-routing-caching-compression": {
    overview: "A reverse proxy accepts traffic on behalf of the service and may terminate TLS, select a backend, compress a response or serve a cached representation. It becomes part of the response’s security and latency path.",
    question: "What trust changes when TLS ends at the proxy?",
    walkthrough: "The proxy decrypts traffic and sees the request in cleartext at that boundary. It may start a separate TLS connection to the backend, rewrite the Host header, add forwarding metadata or serve cached content. Configure the backend to trust forwarding information only from authorized proxies. Set request size, buffering, timeouts and compression policies that fit streaming as well as ordinary responses.",
    example: "A proxy buffers every response for compression and makes an SSE endpoint appear frozen. Test first-byte and incremental-event latency through the real proxy, not just directly against the service.",
    implications: "Define trusted forwarded headers and cache keys explicitly. Verify original scheme and client identity reach the application correctly across the trusted proxy boundary."
  },
  "load-balancing-reverse-proxy-api-gateway__forward-proxy-vs-reverse-proxy": {
    overview: "A forward proxy acts for clients reaching external services, for example enforcing corporate outbound policy. A reverse proxy acts for servers accepting incoming requests, for example routing a public hostname to internal backends.",
    question: "Who is represented by the proxy on each side?",
    walkthrough: "A forward proxy receives a client’s request for an external destination and applies client-side policy, such as outbound access controls. A reverse proxy exposes the server’s public endpoint and chooses the internal upstream. Both can use TLS and caching, so those features alone do not identify the role. Decide whose identity is authenticated and which destination choices are trusted.",
    example: "A corporate developer reaches a public package registry through an outbound proxy. The registry itself sits behind its own reverse proxy. One request passes through both roles for different organizations.",
    implications: "Identify who configures the proxy and whose destination choice it controls. Apply the appropriate identity, logging and access rules on that side of the connection."
  },
  "load-balancing-reverse-proxy-api-gateway__api-gateway-routing-auth-rate-limiting-aggregation": {
    overview: "An API gateway can authenticate incoming clients, enforce quotas and route to the correct service. Aggregating several downstream reads may simplify a mobile client but coupled failures can now affect one response.",
    question: "How do you avoid turning an API gateway into the domain layer?",
    walkthrough: "Centralize shared transport policy such as routing, authentication, request limits and correlation. Let the owning service make state-dependent authorization and business decisions. Aggregation endpoints should define per-dependency deadlines and partial results. Otherwise a slow optional lookup can make a critical route unavailable. Expose downstream contribution to gateway latency so the gateway does not conceal dependency failures.",
    example: "A mobile order summary combines order, payment and recommended products. If recommendations time out, the gateway can omit them under contract. Payment visibility still requires the order service’s tenant and ownership decision.",
    implications: "Set deadlines and partial-result rules for aggregation. Keep domain decisions in the service that owns the data and keep resource-level authorization near that data."
  },
  "load-balancing-reverse-proxy-api-gateway__request-routing-tls-termination-at-the-edge": {
    overview: "At the edge, the TLS handshake establishes a protected client connection and the gateway selects a backend using configured routing information. A separate connection carries the request onward.",
    question: "How does a request travel from hostname to application?",
    walkthrough: "DNS selects an edge address. The client establishes TLS with a certificate valid for the requested hostname. The edge uses trusted host and path rules to choose an upstream, applies configured policy and forwards over an internal connection. Each hop has its own timeouts and identity expectations. Rotation and draining must account for long-lived connections that outlast a routing update.",
    example: "Test deployment with requests already in flight while an upstream becomes unready. Observe certificate validation, route selection and whether old connections drain before that upstream is terminated.",
    implications: "Decide whether the internal hop also needs authenticated encryption. Plan certificate rotation, routing updates and graceful connection draining without dropping in-flight requests."
  },
  "load-balancing-reverse-proxy-api-gateway__health-checks-service-discovery": {
    overview: "Discovery gives a router candidate service addresses. Readiness checks decide which candidates should receive new work. Registration and health information may lag real process state.",
    question: "Why do healthy endpoints still receive calls during rollout?",
    walkthrough: "Discovery, routing caches and readiness checks update asynchronously. An endpoint can receive requests already assigned before it became unready. Graceful removal first stops new assignments, allows propagation, drains in-flight operations and then shuts down. Liveness probes should target problems a restart can repair. Retry safe calls only within a bounded deadline to cover transient stale routing.",
    example: "At t0 mark an instance unready. At t1 an old connection still sends a request. Delay termination until the configured drain window, and measure whether outstanding requests completed or received a retryable response.",
    implications: "Drain before terminating an instance and expect occasional calls to stale endpoints. Use bounded retries for safe requests and avoid probes that create cascading failures."
  },
  "load-balancing-reverse-proxy-api-gateway__rate-limiting-authentication-at-the-edge": {
    overview: "Authenticate the caller before applying a quota tied to a verified tenant identity. A cheap preliminary limit can also protect the authentication path from overload.",
    question: "How should the edge combine caller identity and quotas?",
    walkthrough: "Use a cheap coarse limit to protect the ingress and identity service, then apply finer quotas to verified client or tenant identities. Strip or overwrite incoming identity headers before forwarding trusted claims. Establish an authenticated channel to downstream services that rely on those headers. Limit expensive operations differently from cheap reads because equal request counts can impose very different costs.",
    example: "One report consumes seconds of CPU while one status check takes milliseconds. A shared quota of 100 requests/s for both allows report traffic to exhaust capacity while looking compliant by count.",
    implications: "Define trust for forwarded identity and clear untrusted incoming headers. A public IP alone can group many legitimate users behind one network and is a poor substitute for tenant quotas."
  },
  "load-balancing-reverse-proxy-api-gateway__api-gateway-vs-service-mesh-north-south-vs-east-west": {
    overview: "A gateway handles traffic entering a service environment. A service mesh can apply transport identity, telemetry and routing policies between workloads. A single request can traverse both layers.",
    question: "What is the cost of overlapping gateway and mesh policies?",
    walkthrough: "The gateway handles external contracts, client credentials and public routes. The mesh can handle service discovery, workload identity and transport policy within the service network. Both can impose retries, deadlines and telemetry. Uncoordinated retries multiply downstream attempts, while inconsistent timeouts create abandoned work. Trace one request across all hops and assign ownership of each policy.",
    example: "If a gateway tries three times and a mesh retries each attempt three times, one caller can trigger nine service calls. A single end-to-end budget and an agreed retry owner make that behavior predictable.",
    implications: "Assign one owner for retries and deadlines on each path. Independent retries at the gateway, mesh and client can multiply traffic during a downstream outage."
  },
  "load-balancing-reverse-proxy-api-gateway__gateway-risks-spof-latency-god-object-bff-pattern": {
    overview: "A gateway shared by every client can become a release bottleneck and a common failure point. A backend-for-frontend can tailor aggregation to one client experience without forcing every client to accept the same shape.",
    question: "When is a backend-for-frontend worth operating?",
    walkthrough: "Introduce a BFF when client experiences need materially different aggregation, payloads or release cadences. A mobile client may need one small response on an unreliable network while a desktop app can request several richer resources. A BFF becomes another dependency to scale, secure and monitor. Keep it focused on experience-specific composition so it does not become a second source of business rules.",
    example: "If shipping eligibility changes, both mobile and web should see the same answer from the order domain. Their BFFs can present it differently, but separate eligibility calculations would drift.",
    implications: "Replicate and observe gateways, bound their fan-out and keep business invariants in their owning services. Introduce a BFF when client needs diverge enough to justify its lifecycle."
  },
  "system-design-exercises__design-a-url-shortener": {
    overview: "The write path allocates a unique short code, stores its destination and handles collisions under a unique constraint. The read path looks up that code and returns an HTTP redirect, making caching valuable for popular links.",
    question: "How would you size the keyspace and handle collisions?",
    walkthrough: "A seven-character base62 code provides 62⁷ possible values, about 3.5 trillion. Random generation still produces collisions well before exhaustion, so enforce unique insertion and retry. Sequential allocation with encoding has different predictability and allocation trade-offs. Reads dominate many shorteners, making hot-key caching useful, but redirect status and cache lifetime must match whether destinations can change.",
    example: "A custom alias must be claimed with one atomic uniqueness check. If a link can be revoked, a long-lived browser-cached permanent redirect may bypass your service completely after revocation.",
    implications: "Decide whether destinations can change or expire before choosing redirect caching. Isolate analytics from redirect latency and make revocation work even for heavily cached links."
  },
  "system-design-exercises__design-a-notification-service": {
    overview: "Persist the intent to notify, choose channels using recipient preferences and enqueue delivery attempts. Track success per recipient and channel so a failed SMS does not repeat an already delivered email.",
    question: "Where do preferences, retries and provider callbacks belong?",
    walkthrough: "Keep a durable notification intent with a business ID. Resolve recipients, channel preferences and templates into per-channel delivery records. A worker claims a delivery, applies rate limits, submits to its provider and persists the provider reference. Deduplicate callbacks, which can arrive late or out of order. Check preferences at the correct time for scheduled or sensitive notifications.",
    example: "A provider accepts SMS S at 10:00, a retry response arrives at 10:01 and a delivery receipt arrives at 10:02. Preserve distinct accepted and delivered timestamps without generating a second billable SMS.",
    implications: "Providers can accept a send and lose the reply. Use provider idempotency where available and distinguish accepted, delivered and unknown outcomes in support tooling."
  },
  "system-design-exercises__design-a-news-feed-timeline": {
    overview: "Fan-out on write builds ready-to-read timelines but a celebrity post can create millions of writes. Fan-out on read shifts work to timeline retrieval. A hybrid can merge high-follower accounts during reads.",
    question: "How do you keep a timeline correct during edits and deletions?",
    walkthrough: "Separate the authoritative post and access policy from derived timeline entries. Fan-out can copy identifiers into follower timelines, but an old timeline entry must not authorize viewing a now-private post. Filter or recheck visibility at read time when necessary, and propagate deletions to control storage and freshness. Use stable ordering keys so new posts do not cause duplicates across pages.",
    example: "A celebrity has ten million followers. Enqueuing ten million timeline writes per post can swamp ordinary users’ fan-out. Merge recent celebrity posts at read time and measure the added read latency.",
    implications: "Use a stable pagination cursor and define when deleted or newly private posts disappear. Feed freshness, write amplification and authorization all affect the read design."
  },
  "system-design-exercises__design-a-chat-messaging-system": {
    overview: "Assign a durable message ID before acknowledging a chat send. Persist conversation history and deliver over live connections when available. A reconnecting client asks for messages after its last confirmed position.",
    question: "What should a chat acknowledgement mean?",
    walkthrough: "Persist the message under a stable client or operation ID and assign the conversation’s ordering position before acknowledging durable acceptance. Live delivery to a device and read receipt by a user are later states. On reconnect, fetch after the last confirmed position, deduplicate received IDs and detect gaps. Presence and typing indicators can use shorter-lived, weaker delivery guarantees.",
    example: "A sender loses connectivity after the server commits message 88. It resends the same client message ID. Return position 88 and avoid appending message 89 with identical content.",
    implications: "Define ordering per conversation, deduplicate client retries and separate delivery receipts from read receipts. Presence can tolerate weaker consistency than message history."
  },
  "system-design-exercises__design-a-distributed-job-task-scheduler": {
    overview: "Store a job’s schedule, next due time and execution identity durably. Dispatchers atomically claim due executions and workers renew leases while performing the work.",
    question: "How do you model a recurring execution independently of its worker?",
    walkthrough: "Store the schedule, its time-zone rules, next due time and a durable occurrence ID. Claim an occurrence conditionally, record progress and make worker effects safe to repeat after lease loss. Decide whether a missed schedule produces all missed runs, one catch-up run or none. Store enough timing information to explain behavior around daylight-saving changes and late execution.",
    example: "The 09:00 daily invoice run starts at 09:05 after downtime. Its occurrence identity still represents the scheduled 09:00 run. Restarting at 09:06 should resume that occurrence, not create another invoice batch.",
    implications: "If a worker pauses beyond its lease, another worker may retry. Deduplicate execution effects and specify catch-up rules for missed occurrences, daylight-saving changes and scheduler outages."
  },
  "system-design-exercises__design-a-distributed-cache-redis-memcached": {
    overview: "Distribute cache keys across nodes and cap memory per node. On a miss, recover from an authoritative store. Node loss can therefore become an origin traffic surge even when cached data is disposable.",
    question: "How should a cache behave when capacity suddenly disappears?",
    walkthrough: "Define shard placement, replication and ownership changes, then trace misses back to the authority. Losing one cache node can remove an entire hot range at once. Replication reduces cold reads but increases memory and update complexity. Coalesced refills, stale serving and admission limits protect the origin during recovery. Monitor evictions and misses by shard so one failing range is visible.",
    example: "If a 95% hit rate falls to 70% at constant traffic, origin demand rises from 5% to 30%, a sixfold increase. The cache can remain mostly available while its database overloads.",
    implications: "Plan replication or graceful degradation for hot entries, bound concurrent refills and monitor hit rate by key group. Include mass eviction and rebalancing in capacity tests."
  },
  "system-design-exercises__design-a-key-value-store-dynamo-cassandra": {
    overview: "Partition keys, replicate each partition and define how reads select a version when replicas disagree. A write-optimized store can append to a log and memory table, then flush sorted files and compact them.",
    question: "How does a write reach an LSM-based key-value store?",
    walkthrough: "Route the key to its replica set. Each participating node typically appends to a commit log and updates a memory structure, later flushing sorted immutable files. Reads may consult several files; filters and indexes reduce unnecessary work. Compaction merges files and removes obsolete versions when safe. Replication acknowledgement, conflict resolution and repair determine what survives failures independently of the local disk layout.",
    example: "A delete becomes a tombstone. If it is discarded before an offline replica is repaired, the stale replica can reintroduce an old value. Coordinate retention, repair windows and maximum expected outage.",
    implications: "Budget for compaction, repair and tombstones. Select consistency and conflict semantics for the application before choosing quorum sizes or promising low-latency local writes."
  },
  "system-design-exercises__design-a-typeahead-autocomplete": {
    overview: "Precompute or index candidate completions by normalized prefix and return a small ranked result set. Popular prefixes can be cached near readers while a background process updates rankings.",
    question: "How would you serve top suggestions within a tight latency budget?",
    walkthrough: "Normalize the prefix according to language and product rules. Retrieve a bounded candidate set from a trie, sorted index or prefix-to-top-K table, then rerank using popularity, recency and permitted personalization. Precomputing short popular prefixes reduces read work but makes updates and deletions more complex. Treat private query history as user-scoped data with explicit retention.",
    example: "For prefix “ca”, precompute a public candidate set and rerank for the current context. Check that a term seen only in one user’s private history never appears in another user’s shared cached response.",
    implications: "Evaluate relevance alongside latency. Define language normalization, privacy boundaries for personalized suggestions and how quickly removed or sensitive entries disappear from cached results."
  },
  "system-design-exercises__design-a-metrics-monitoring-alerting-system": {
    overview: "Collect timestamped measurements into a time-series store, evaluate rules over windows and route actionable alerts to an owner. Distinguish a missing sample from an observed zero.",
    question: "How do collection, storage and alert evaluation fit together?",
    walkthrough: "Collect timestamped values with bounded dimensions, buffer or sample during bursts, and store them in time-series partitions with retention and rollups. Counters, gauges and histograms need different aggregation semantics. Alert rules evaluate windows and route notifications to accountable owners. Decide how delayed data and missing telemetry affect alert state, and monitor the monitoring path itself.",
    example: "Adding user_id as a label to 100 metrics for a million users can create up to 100 million distinct series before other labels. Put high-cardinality per-user detail in an appropriate log or trace path instead.",
    implications: "Bound label cardinality because one label per request can overwhelm storage. Test alert behavior when the telemetry pipeline itself fails and suppress duplicates during a single incident."
  },
  "system-design-exercises__design-a-feature-flag-service": {
    overview: "Distribute versioned flag snapshots and evaluate locally for low request latency. A stable hash of subject and flag can keep a user in the same rollout cohort between requests.",
    question: "How does local flag evaluation stay reproducible during rollout?",
    walkthrough: "Distribute versioned configuration snapshots and evaluate conditions against a defined context. Hash a stable subject identifier with the flag key and compare its bucket to the rollout threshold. Keep hashing and normalization consistent across languages. Atomic snapshot replacement avoids mixing two versions of related targeting rules. Missing context, stale configuration and a disconnected control plane each need explicit defaults.",
    example: "Raise a rollout from 5% to 10%. With a stable hash and unchanged targeting, users in the first 5% stay included. Re-randomizing on each request would make a user’s experience alternate unpredictably.",
    implications: "Define safe defaults and maximum staleness for each flag. Audit changes, support rollback, and measure propagation time for a kill switch that must take effect quickly."
  },
  "system-design-exercises__design-a-payment-order-flow-with-exactly-once-effects": {
    overview: "Give each checkout attempt a stable ID, persist order state transitions and use the same provider idempotency key on retries. Deduplicate provider callbacks and reconcile ambiguous responses against provider records.",
    question: "How do you reconcile provider and order states after an ambiguous payment?",
    walkthrough: "Model separate transitions for creation, authorization, capture, cancellation and refund as appropriate. Persist the intended transition and use one stable idempotency reference per provider operation. Callbacks can duplicate or arrive out of order, so deduplicate and validate legal transitions. Periodically compare unresolved local operations with provider records. The guarantee concerns the business effect within defined provider and retention boundaries.",
    example: "Capture request C times out. Keep the order in capture-pending, query the provider by C and accept a matching verified callback. Starting a new capture under another key before reconciliation creates a second-charge risk.",
    implications: "Distinguish authorized, captured and refunded states. A timed-out capture is an unknown outcome. Look it up or retry under the same key before issuing another charge."
  },
  "system-design-exercises__design-a-campaign-workflow-engine-marketing-automation": {
    overview: "Model a campaign as a versioned workflow with durable per-recipient progress. A waiting step records a due time so execution can resume after restart without holding a worker for days.",
    question: "How does a waiting campaign step survive deployment and edits?",
    walkthrough: "Compile the campaign into versioned steps and condition transitions. Persist each participant’s current step, workflow version, due time and completion identity. Resume a due participant through an atomic claim, recheck eligibility and record the resulting transition. External sends need their own durable intent and deduplication. Preserve enough history to explain why a person received or skipped a message.",
    example: "A user enters version 4 and waits two days. Version 5 removes the next email and the user opts out overnight. Decide the migration policy for version 4, but honor current consent at send time under either version.",
    implications: "Recheck consent when sending, deduplicate each step and define whether in-flight recipients follow old or new workflow versions. Rate-limit delivery separately from advancing workflow state."
  },
  "authentication-authorization__oauth2-vs-oidc-vs-saml": {
    overview: "OAuth 2.0 lets a client obtain authorization to call a resource. OpenID Connect adds a sign-in protocol and ID token. SAML commonly carries signed authentication assertions for enterprise federation.",
    question: "Which party consumes each artifact during sign-in?",
    walkthrough: "In OIDC sign-in, the client relies on the identity provider’s ID token after validating its issuer, intended client, signature and applicable nonce and lifetime. An access token is for a resource server, which validates it according to its format and authorization contract. SAML federation commonly delivers a signed assertion to a service provider that establishes its own session. Each artifact has a consumer and intended use.",
    example: "A web app can create a local session after valid OIDC sign-in. When calling the billing API it sends an access token for billing. The API must decide whether that identity may read this particular invoice.",
    implications: "Start by asking who needs which proof. A web app establishing a login session and an API checking delegated permissions consume different artifacts and validate different audiences."
  },
  "authentication-authorization__authorization-code-pkce": {
    overview: "A client creates a random verifier and sends its derived challenge with the authorization request. Redeeming the resulting code requires the verifier, binding the exchange to the initiating client.",
    question: "What does PKCE bind to the authorization code?",
    walkthrough: "The initiating client generates a high-entropy verifier and sends a derived challenge in the authorization request. With S256 the challenge is a base64url-encoded SHA-256 digest of the verifier. The authorization server associates it with the issued code. At the token endpoint it recomputes the challenge from the presented verifier before accepting the exchange. Keep the verifier with the initiating session and discard it after use.",
    example: "Browser returns with a short-lived code. The client sends the code, verifier and required client authentication or identification to the token endpoint. An unrelated session should not be able to complete that sign-in using its own verifier.",
    implications: "Use the S256 challenge method, validate the redirect and correlate the callback with the initiating session. For OIDC sign-in, validate the returned identity and nonce where applicable."
  },
  "authentication-authorization__client-credentials": {
    overview: "A background invoice processor has no signed-in user. It authenticates itself to the token service and requests an access token representing the application for the billing API.",
    question: "Who is authorized when a daemon receives a token?",
    walkthrough: "The confidential client authenticates to the authorization server using an approved credential or workload identity. It obtains an access token intended for the target API under application permissions. The API must authorize the application identity, including tenant and operation restrictions. There is no end-user consent context attached to the act of processing a job. Cache tokens with bounded lifetime and avoid logging their contents.",
    example: "A nightly importer may be allowed to upload invoices but have no permission to refund them. Test the token against both operations, and verify audit records identify the workload and the specific import job.",
    implications: "Grant application permissions narrowly, protect or eliminate long-lived secrets and cache tokens until near expiry. Audit operations under the workload identity because no user delegated them."
  },
  "authentication-authorization__on-behalf-of-obo": {
    overview: "A frontend calls API A with a user token intended for A. To call API B on the user’s behalf, A authenticates itself and exchanges the delegated context for a token intended for B.",
    question: "What does the middle-tier service exchange, and why?",
    walkthrough: "In a delegated on-behalf-of flow, API A receives and validates an access token intended for A. It authenticates itself to the token service and presents the incoming delegated context to request a token for API B. The resulting token must satisfy B’s audience and permission checks. This preserves the distinction between the application calling and the user on whose behalf it acts.",
    example: "If A can read a user’s profile but B requires calendar permission, token exchange should not silently elevate authority. Handle consent or authorization failure and avoid falling back to broad application privileges.",
    implications: "B validates its own audience and permissions. If B requires additional consent, handle that explicitly. Forwarding the original token across audiences undermines the service boundary."
  },
  "authentication-authorization__device-authorization-device-code": {
    overview: "A device with limited input displays a short code and verification address. The user completes sign-in and approval on another device while the original device polls for the result.",
    question: "How do the device and browser sessions meet?",
    walkthrough: "The device obtains a device code plus a short user-facing code and verification location. The browser user authenticates with the identity provider and approves the device session identified by that flow. The device polls the token endpoint using the device code until approval, denial or expiry. Keep the device code confidential to the device and respect any instruction to slow polling.",
    example: "If approval finishes after the code expires, start a fresh device flow and present its new code. Never assume an old approval authorizes an unrelated newly generated device session.",
    implications: "Respect polling intervals and expiry. Show the user which device and application they are approving, and handle denial or abandonment without leaving the device polling indefinitely."
  },
  "authentication-authorization__refresh-tokens-rotation": {
    overview: "A short-lived access token limits the duration of ordinary API access. A refresh token can obtain another one. Rotation replaces each used refresh token and can help detect reuse of an older credential.",
    question: "What should happen when the same refresh token is used twice?",
    walkthrough: "Under rotation, the issuer exchanges a valid refresh token for a new token and retires the previous one. Reuse of a retired credential can indicate exposure, but concurrent legitimate refreshes can produce a similar symptom. Serialize refresh per session where practical, store new tokens atomically and follow the issuer’s detection and revocation behavior. Public clients need an appropriate replay defense such as rotation or sender constraint.",
    example: "Two browser tabs discover an expired access token together. If both refresh independently, one can invalidate the other’s session. Share the refreshed state safely or coordinate refresh so only one exchange is in flight.",
    implications: "Store refresh tokens as high-value secrets and coordinate simultaneous refreshes. Define revocation and recovery behavior when a token family appears compromised or two legitimate requests race."
  },
  "authentication-authorization__implicit-ropc-know-why-they-re-deprecated": {
    source: { title: "OAuth 2.0 Security Best Current Practice (RFC 9700)", url: "https://www.rfc-editor.org/rfc/rfc9700.html" },
    overview: "The implicit flow returned tokens via the browser-facing authorization response. Resource owner password credentials required the application to handle the user’s password directly and fit poorly with modern interactive authentication.",
    question: "Why do modern deployments use different grants?",
    walkthrough: "Implicit issuance exposes access tokens in the authorization response path and lacks the protections of a code redeemed at a token endpoint with PKCE. The password grant gives the application direct custody of user credentials and breaks the separation needed for modern authentication methods. RFC 9700 prohibits the password grant and advises against implicit access-token issuance except under tightly qualified protections. Migrate by identifying the actual actor and client capabilities.",
    example: "An interactive browser app should redirect to the identity provider and redeem a code appropriately. An unattended integration should use workload credentials. Copying a human password into a service account field inherits the wrong trust model.",
    implications: "For interactive clients, explain the code flow with PKCE and a hosted sign-in experience. For a daemon, choose an application identity that does not collect a human password."
  },
  "authentication-authorization__jwt-tokens-cookies-validation-sig-iss-aud-exp-key-rotation": {
    overview: "A JWT is a token representation. A cookie is a browser transport and storage mechanism. The credential inside can represent an application session or another artifact with different validation needs.",
    question: "How do token validation and credential transport fit together?",
    walkthrough: "For a signed token, trust a configured issuer and acceptable algorithm, obtain its public keys from trusted metadata, verify the signature and validate claims relevant to the recipient. JWT contents are generally readable when merely signed. A cookie’s security properties come from its contents, transport settings and browser behavior. An opaque session ID may refer to server-side session state instead of carrying claims.",
    example: "A validly signed access token for API A reaches API B. B rejects it on audience even though the signature verifies. A cookie-based browser session additionally needs protection for state-changing requests automatically carrying that cookie.",
    implications: "For JWTs, validate allowed signature algorithms, trusted keys, issuer, audience and time bounds. For session cookies, protect integrity and use appropriate Secure, HttpOnly, SameSite and request-forgery protections."
  },
  "authentication-authorization__rbac-abac-claims-scopes": {
    overview: "Roles group permissions by job function. Attribute-based policies evaluate facts about the actor, resource and context. Claims carry statements about the principal, and scopes express permitted operations within a delegated grant.",
    question: "How do roles, scopes and attributes combine in one decision?",
    walkthrough: "A token can carry attributes or claims about the actor, such as tenant and application identity. A scope may permit attempting invoice approval. A role may establish the user is a finance approver. A resource policy can additionally check ownership, amount threshold and separation of duties. Evaluate those controls against the actual resource and trusted current state. Long-lived token claims can outlast a permission change.",
    example: "A finance approver has invoice.approve in tenant A. Decline an invoice from tenant B and an invoice the same user submitted if the workflow requires an independent approver. A matching role alone is insufficient.",
    implications: "A scope allowing invoice reads still needs a check that this invoice belongs to the authorized tenant. Model and test the resource decision independently of route access."
  },
  "application-security__owasp-top-10-the-categories": {
    source: { title: "OWASP Top Ten categories, 2025 edition", url: "https://top10.owasp.org/2025/" },
    overview: "Use the OWASP Top Ten as a review prompt for recurring web application risks. Walk a real request through access control, configuration, dependency trust, data handling, authentication and incident visibility to find where controls belong.",
    question: "How do you use the 2025 categories in a design review?",
    walkthrough: "Walk through access decisions, deployment configuration, software supply-chain controls, cryptographic handling and injection prevention. Then examine design assumptions, authentication, software and data integrity, logging and alerting, and behavior under exceptional conditions. Use the published edition for precise category names. For each risk relevant to the feature, identify an owner, a concrete control and observable evidence that the control still works.",
    example: "For an invoice export, verify tenant-scoped access, parameterized filters, private storage and a bounded failure path. Expire the storage credential in a test and verify the export fails safely and produces an actionable alert.",
    implications: "For an invoice download, verify ownership on the server and log a denied decision without logging private content. Record the edition when discussing category names because the list evolves."
  },
  "application-security__owasp-essentials-sqli-xss-csrf-how-net-defends": {
    overview: "Bind SQL parameters to separate values from query structure. Encode untrusted text in its output context to prevent script interpretation. For cookie-authenticated state changes, validate an antiforgery token where required.",
    question: "Where do .NET defenses apply, and where can they be lost?",
    walkthrough: "EF parameterized queries protect value binding when the application preserves the separation between SQL and data. Razor encodes ordinary rendered text, but different contexts such as URLs or script need appropriate handling and raw HTML explicitly bypasses encoding. Cookie-based forms typically need antiforgery validation on state changes. Validate each boundary independently because an endpoint can be sound at one layer and unsafe at another.",
    example: "Trace a customer-supplied display name through storage, a Razor text element and an administrative export. Review how each destination interprets the value and keep its context-specific protection at that destination.",
    implications: "Map the control to the boundary. Parameterizing a query cannot make raw HTML output trustworthy, and HTML encoding cannot establish that a browser intentionally submitted a transfer."
  },
  "application-security__cors-vs-csrf-people-confuse-these": {
    overview: "CORS governs when a page may read a cross-origin response. CSRF concerns a browser sending an unwanted authenticated state-changing request. A browser can sometimes send a request even when the page cannot read the result.",
    question: "Why can a request change state even if the browser blocks the response?",
    walkthrough: "The same-origin policy and CORS govern the browser’s ability to expose a response to another origin. For certain requests the browser can send the network request before applying a response-sharing decision. Whether cookies accompany it depends on cookie and browser policy, including SameSite. The server should verify user intent for authenticated state changes with appropriate antiforgery protection rather than relying on response visibility.",
    example: "Test a legitimate cross-origin frontend reading permitted resources, then test a cookie-authenticated form submission without a valid antiforgery token. The CORS and antiforgery tests should exercise distinct decisions.",
    implications: "For a cookie-backed settings form, require appropriate antiforgery protection and choose cookie SameSite settings deliberately. Configure cross-origin access separately for legitimate client applications."
  },
  "application-security__validating-a-jwt-key-rotation": {
    overview: "An API should accept only tokens intended for that API and issued by an authority it trusts. Validate the signature with trusted issuer keys, allowed algorithms, audience, issuer and token lifetime.",
    question: "What happens when the issuer starts signing with a new key?",
    walkthrough: "Published issuer metadata points to trusted signing keys. A token’s key identifier can select among those keys, but the token must not dictate an arbitrary trusted issuer or key source. On a new key ID, refresh trusted metadata under bounded rate and cache rules. Keep valid overlapping old keys as appropriate for outstanding tokens. Continue verifying signature, issuer, audience and lifetime on every accepted token.",
    example: "During a staged rollover, test a valid old-key token, a valid new-key token and an unknown untrusted key. Observe refresh traffic and rejection reasons without recording the token itself.",
    implications: "Use issuer metadata and bounded key refresh to support rotation. Cache trusted keys appropriately and handle an unknown key without accepting an unverifiable token or hammering discovery."
  },
  "application-security__https-tls-what-it-actually-gives-you": {
    overview: "TLS provides confidentiality and integrity in transit and normally authenticates the server through certificate and hostname verification. It protects data only between the endpoints of that TLS connection.",
    question: "Which guarantees end when TLS terminates?",
    walkthrough: "TLS negotiates session keys and protects the confidentiality and integrity of data in transit between its peers. Normal client validation checks certificate trust and the intended hostname. TLS does not establish that the person using an application may access a particular account, and data can be exposed after decryption in logs or storage. Each proxy termination creates a new trust boundary.",
    example: "Draw browser → gateway → application → database. Mark where each TLS connection ends, which identity was verified and who can read the resulting plaintext. This identifies where a separate encrypted and authenticated hop is required.",
    implications: "Trace the full route when a load balancer terminates TLS. Decide how the next hop is protected and continue enforcing application authorization for the data after decryption."
  },
  "application-security__password-storage-hashing-salting-work-factor": {
    overview: "Store a password verifier produced by a dedicated salted password-hashing algorithm. A distinct random salt prevents equal passwords from yielding the same stored verifier, and the work factor raises the cost of each guess.",
    question: "How does password verification work after changing the work factor?",
    walkthrough: "Store the algorithm, salt, cost parameters and derived verifier according to a maintained password-hashing format. On sign-in, use the stored parameters to verify the supplied password. After success, compare the stored policy with today’s target and rehash at the new cost if needed. A memory-hard function can raise both memory and computation costs for guessing. Size verification resources under concurrent legitimate load.",
    example: "Two users choosing the same password should receive distinct salted verifiers. After increasing the configured cost, an existing user should still sign in and receive an upgraded verifier without storing or recovering plaintext.",
    implications: "Use a maintained password hasher, choose cost through measurement and retain algorithm parameters with the verifier. Upgrade older hashes after successful authentication."
  },
  "application-security__secrets-management-key-vault": {
    overview: "Give a workload an identity authorized to read its specific secret from a vault. This removes the need to distribute a shared bootstrap password with the application package.",
    question: "How can a secret rotate without breaking every running instance?",
    walkthrough: "Separate the workload’s identity from the secret it needs. Authorize that identity for only required operations and distinguish permissions for reading a secret, managing it and using a key. Give cached secrets bounded lifetimes and plan a period where old and new credentials both work when the provider permits it. Observe which version each instance uses without recording the value.",
    example: "Publish credential V2, update or refresh consumers, verify authenticated calls with V2 and only then retire V1. Test how a long-running worker behaves if its cache refresh fails halfway through rollout.",
    implications: "Rotate credentials with an overlap period where the dependency permits it. Test how running instances refresh cached values and keep secret contents out of logs and error responses."
  },
  "application-security__multi-tenant-isolation-data-authz-everywhere": {
    overview: "Derive tenant context from a verified identity and authorization decision, then carry it through queries, cache keys, object storage and background jobs. A client-supplied tenant identifier needs an entitlement check.",
    question: "Where must tenant identity travel outside an HTTP request?",
    walkthrough: "Resolve authorized tenant context before data access and carry it explicitly into message envelopes, scheduled jobs, cache key generation, file paths, search indexes and exports. On consumption, validate the identity and authority of the producer and the allowed tenant operation. Database row policies and composite keys can reinforce application filters. A cross-tenant support role needs narrowly scoped, auditable behavior.",
    example: "Schedule two exports with the same invoice number from different tenants. Verify output rows, generated filenames, object access policies and download links. Correct SQL filtering alone does not prevent a storage-path collision.",
    implications: "Test two tenants with overlapping resource IDs across detail pages, exports and asynchronous work. Treat cross-tenant administrative access as a distinct, audited permission."
  },
  "application-security__encryption-at-rest-in-transit-kms-key-vault": {
    overview: "Disk or database encryption protects stored media. TLS protects a connection. Envelope encryption can use a managed key to wrap data keys so access to stored ciphertext and key use can be governed separately.",
    question: "How does envelope encryption separate key management from bulk encryption?",
    walkthrough: "Generate a data-encryption key to encrypt the payload using a suitable authenticated scheme. Wrap that data key with a managed key and store the wrapped key and required metadata alongside the ciphertext. Limit unwrap permission and record key use. Rotating a wrapping key may permit rewrapping data keys, depending on the design, without re-encrypting every large payload. Restoration requires access to the correct historical keys.",
    example: "Recover a backup into a controlled environment. Verify it can obtain the authorized old key version, decrypt a known record and reject a modified ciphertext. A readable backup file alone is not an end-to-end recovery test.",
    implications: "Trace who can decrypt at each stage, including backups and recovery. Exercise key rotation and restoration because deleting the only usable key can make intact ciphertext unrecoverable."
  },
  "application-security__mtls-for-service-to-service": {
    overview: "In mutual TLS, both peers present credentials and verify the identity of the other endpoint. A workload identity in a client certificate can identify which service is making a connection.",
    question: "How does a certificate become a service authorization decision?",
    walkthrough: "During the TLS handshake each side proves possession of a private key associated with a trusted certificate. Validate chain, lifetime and the expected peer identity under the workload identity scheme. Map that identity to permitted operations and keep the policy narrow. Service-mesh termination may mean the application receives peer identity through trusted local infrastructure, which must preserve the binding.",
    example: "Payments accepts a connection from orders and one from reporting. Both can have valid certificates under the same CA. Only orders should be authorized to submit a charge if reporting is entitled only to summaries.",
    implications: "Issue short-lived certificates, automate renewal and map verified identities to explicit permissions. Successful peer authentication alone does not authorize every operation exposed by the destination."
  },
  "application-security__dependency-supply-chain-scanning-sbom": {
    overview: "A software bill of materials records what components and versions went into an artifact. Scanning that inventory against advisories helps a team identify affected releases even when a vulnerability is announced after deployment.",
    question: "How do you go from an advisory to a verified production fix?",
    walkthrough: "Generate an inventory from the actual build, including transitive components, and associate it with an immutable artifact digest. Compare the inventory with advisories, determine which deployed versions are exposed, and assess affected code paths. Patch or replace the component, rebuild through the trusted pipeline and verify the new digest reaches running workloads. An SBOM aids discovery while signatures and provenance answer different integrity questions.",
    example: "An advisory arrives for library L. Query deployed digests containing the affected version, map them to services and owners, then verify the replacement digest and fresh inventory after rollout. A clean source dependency file alone is insufficient.",
    implications: "Link the inventory to the deployed artifact digest, verify provenance and prioritize remediation using exposure and reachability. Rebuild and verify the replacement so a manifest edit does not masquerade as a production fix."
  },
  "oop-solid-design-patterns__solid-kiss-dry-and-when-to-break-them": {
    overview: "Two pricing functions that look similar can encode different promises. One estimates a cart total, while the other produces the legally agreed invoice total. The important duplication is a rule that must change together.",
    question: "How would you choose between duplicating and abstracting those rules?",
    walkthrough: "Identify the business owner, invariant and likely reason for change. DRY helps when both callers depend on the same knowledge. KISS favors the simplest representation that makes that knowledge clear. SOLID helps place responsibilities so a new policy has a small, predictable impact. Extracting a function with five flags just to remove matching lines makes future changes harder to review.",
    example: "A promotion starts rounding estimated prices to whole units, while invoices still round to cents. Separate estimation and settlement policies allow one change. Share the currency rounding primitive only when its contract is identical.",
    implications: "In an interview, name the next realistic change and walk through how many callers it affects. That is more informative than counting interfaces or duplicated lines."
  },
  "oop-solid-design-patterns__clean-hexagonal-architecture-the-dependency-rule": {
    overview: "Hexagonal architecture separates the application’s use cases from the mechanisms that call them or supply external capabilities. Clean Architecture similarly places high-level policy behind boundaries that protect it from framework and storage details.",
    question: "Why can a use case call outward while source dependencies point inward?",
    walkthrough: "An application use case declares the port it needs, such as reserving inventory. An infrastructure adapter implements the port using SQL. At runtime the use case calls the adapter through that contract. At compile time the adapter depends on the application’s port, while the application never imports the database driver. Dependency injection at startup connects the pieces.",
    example: "HTTP cancellation endpoint → CancelOrder use case → inventory port → SQL adapter. A queue consumer can call the same CancelOrder use case. Test the rule with an in-memory port, then integration-test the real adapter’s transaction semantics.",
    implications: "A port returning IQueryable or vendor exceptions can leak the external implementation back into policy. Shape the contract around the operation and failure modes the use case needs."
  },
  "oop-solid-design-patterns__ddd-building-blocks-you-should-name": {
    overview: "A domain model expresses business decisions using names meaningful to the people making them. Entities maintain identity across change, while value objects are compared by their meaningful components. An aggregate defines which changes must preserve invariants together.",
    question: "How do the building blocks cooperate during checkout?",
    walkthrough: "An Order entity owns line items and the transition from draft to submitted. Money is a value object carrying amount and currency. The aggregate root rejects submission of an empty order. A domain service can calculate a rule spanning concepts where no one entity owns all the information. An application service coordinates loading, invoking and saving. A repository provides an aggregate-oriented persistence boundary.",
    example: "Load order 81, apply its agreed price policy, call Submit, persist the order and record OrderSubmitted. Test rejection of a second submission on the aggregate itself and test persistence and event handoff at the application boundary.",
    implications: "A class named Service or Repository adds little unless its responsibility is clear. Explain which component enforces the invariant under concurrent writes."
  },
  "oop-solid-design-patterns__ddd-depth-aggregates-bounded-contexts-domain-events-ubiquitous-languag": {
    overview: "An aggregate protects an immediate consistency rule. A bounded context protects a coherent meaning for concepts and language. One bounded context commonly contains many aggregates. Domain events describe facts that other parts of the model may react to.",
    question: "How do different meanings of “order” affect architecture?",
    walkthrough: "Sales needs an order’s agreed lines and total. Fulfillment needs packages, addresses and shipment progress. Their models overlap in identity but evolve under different rules. Domain experts help name the concepts precisely. Sales can publish a versioned integration event derived from a committed domain change. Fulfillment translates it into its own commands and handles delayed or duplicate events.",
    example: "Sales commits an accepted order, then fulfillment creates a shipment later. Grouping every sales and warehouse record into one aggregate would serialize independent work. Track pending fulfillment as an expected state and reconcile failed handoffs.",
    implications: "Place an invariant inside one aggregate when it truly must be atomic. If two contexts need a synchronous guarantee, make the cost and authority explicit rather than assuming events enforce it."
  },
  "oop-solid-design-patterns__repository-unit-of-work-with-ef-still-needed": {
    overview: "A DbContext coordinates tracked changes across sets, and SaveChanges persists a unit of work. Wrapping every DbSet with identical CRUD methods can obscure projections, transactions and query behavior without creating a useful domain boundary.",
    question: "When does a custom repository improve the design?",
    walkthrough: "A domain-facing repository can load an aggregate in the shape needed to preserve its invariants and expose a meaningful operation such as finding orders awaiting settlement. Let the outer use case own the commit boundary so two related writes cannot be independently committed through separate repositories. A read-only report can use a direct DTO projection without loading an aggregate at all.",
    example: "If OrderRepository.Add immediately calls SaveChanges and OutboxRepository.Add calls it again, the order may commit alone. Stage both changes in the same context and commit at the use-case boundary.",
    implications: "Keep real-provider integration tests for translation, constraints and concurrency. A fake repository can test domain decisions but cannot establish that the production query is correct."
  },
  "oop-solid-design-patterns__strategy-factory-decorator-observer-net-examples": {
    overview: "All four patterns can appear in one notification flow, but each answers a different design question. Strategy chooses behavior, a factory constructs or selects an object, a decorator wraps a compatible operation, and Observer distributes notifications to interested listeners.",
    question: "How would you identify them from the call path?",
    walkthrough: "A routing strategy chooses a channel based on preferences. A factory resolves the sender configured for that channel. A metrics decorator implements the sender contract and delegates to the inner sender while recording duration. Subscribers observe an accepted-delivery event. Establish whether observers are synchronous and how exceptions affect the publisher before using them for required business steps.",
    example: "An email times out. The decorator records one failed send attempt, the strategy’s original choice remains email, and no accepted-delivery event should fire. A safe retry policy belongs where delivery identity and provider behavior are known.",
    implications: "Name the responsibility and failure contract of each collaborator. The same interface-and-implementation syntax can express several patterns, so class names alone cannot explain a design."
  },
  "oop-solid-design-patterns__gof-patterns-beyond-those-creational-structural-behavioral": {
    overview: "The GoF families group recurring design decisions. Creational patterns move construction decisions, structural patterns organize relationships among objects, and behavioral patterns organize responsibility and communication. Start from the source of change before choosing a family.",
    question: "Which patterns fit building and exporting a document tree?",
    walkthrough: "A Builder can incrementally assemble a validated document. Composite lets a section contain paragraphs and nested sections behind a common traversal contract. Visitor can add export operations over known node types without putting every export format into every node. The trade-off is that introducing a new node type can require changing every visitor. An Adapter is useful when one exporter must target an incompatible external API.",
    example: "Adding Markdown export means adding a visitor for existing node types. Adding a new Chart node means updating all visitors. Which change is more frequent should influence whether Visitor pays for itself.",
    implications: "Compare patterns with similar shapes by intent. A Facade simplifies a subsystem, an Adapter translates a contract and a Proxy controls access to an existing contract."
  },
  "oop-solid-design-patterns__mediator-mediatr-in-process-cqrs": {
    overview: "A mediator dispatches a request to its handler inside the application. In-process CQRS can use distinct handlers and result types for commands and queries while sharing one deployment and database. Dispatch is an ordinary in-process operation with the same failure domain as its caller.",
    question: "What belongs in the pipeline and what belongs in the handler?",
    walkthrough: "A pipeline behavior can validate input, record duration or establish a transaction around selected commands. The handler owns the business use case and uses explicitly injected dependencies. Separate read handlers can project directly into response DTOs. Publishing an in-process notification does not durably enqueue it. A process crash still loses work that was never recorded outside memory.",
    example: "SubmitOrder handler succeeds and the process exits before an email notification handler runs. Persist the notification intent with the order if the email is required. The mediator is a routing mechanism, not a delivery guarantee.",
    implications: "Use a mediator when the dispatch and shared pipeline simplify real use cases. A direct method call can be clearer for a small service with no common pipeline needs."
  },
  "oop-solid-design-patterns__di-done-right-the-service-locator-anti-pattern": {
    overview: "Constructor injection shows what an object needs to do its job. The composition root chooses implementations and lifetimes. A service locator hides collaborators behind calls to a general-purpose resolver and often delays configuration errors until a particular branch runs.",
    question: "When is resolving a dependency dynamically appropriate?",
    walkthrough: "A host, job dispatcher or plugin boundary sometimes must create a scope and resolve a handler selected at runtime. Keep that resolution at the composition boundary or behind a narrow typed factory. The domain operation should declare the capability it needs, so a caller can construct and test it without assembling a container. Validate scopes and required registrations at startup where possible.",
    example: "A RefundService taking IPaymentProvider and IRefundLedger exposes its two collaborators. If it instead takes IServiceProvider, a missing ledger registration may first appear during a real refund.",
    implications: "Use dependency lifetime as part of the design. Explicit injection makes it easier to notice a singleton retaining a request-scoped context."
  },
  "oop-solid-design-patterns__composition-over-inheritance": {
    overview: "Inheritance makes a derived object substitutable under a base contract when its behavior honors that contract. Composition builds behavior from collaborators. It is especially useful when several independent dimensions can vary, such as format, compression and destination.",
    question: "Why does combining independent variations in subclasses grow expensive?",
    walkthrough: "A hierarchy with CsvExporter and JsonExporter may be manageable until both need encrypted and compressed variants for two destinations. Each combination duplicates or inherits implementation details. Instead compose a formatter, a stream transformation and a destination. Each component gets one reason to change and can be tested against its own contract. Use inheritance for a genuine stable abstraction whose invariants derived types can preserve.",
    example: "Build JSON → gzip → file and CSV → gzip → network with the same compression component. Ensure wrapper disposal flushes compression before the destination is closed, a lifecycle rule introduced by composition.",
    implications: "Composition also introduces wiring and indirect calls. For one stable behavior a straightforward implementation can remain easier to read."
  },
  "oop-solid-design-patterns__anti-corruption-layer-null-object-result-option": {
    overview: "Translate external meanings at the boundary, then model intentional absence and expected failure explicitly. An anti-corruption layer maps between domain languages. Option represents a value that may be absent. Result captures success or an expected reason an operation failed. A Null Object provides a legitimate neutral behavior.",
    question: "When does treating absence as a no-op create a bug?",
    walkthrough: "An optional metrics sink can safely do nothing when telemetry is disabled. A missing payment gateway cannot safely report that a charge succeeded. Likewise, a legacy lookup returning one code for “unknown customer” and another for “service unavailable” needs a translation that preserves that distinction. Option alone loses the reason for an operational failure; Result can carry that outcome explicitly.",
    example: "Map an unknown customer to a successful lookup with no customer, an upstream timeout to an unavailable result, and a valid row to a customer. Test all three before letting checkout decide how to proceed.",
    implications: "Choose the representation from what the caller must decide next. A neutral substitute is correct only when doing nothing genuinely satisfies the contract."
  },
  "oop-solid-design-patterns__when-you-should-not-apply-a-pattern-overengineering": {
    overview: "A pattern has a cost in navigation, vocabulary, wiring and testing. It earns that cost when it simplifies an identifiable change, isolates a real dependency or protects a meaningful invariant. A single implementation can justify a boundary when its external effects are significant.",
    question: "How would you evaluate a pattern proposed in code review?",
    walkthrough: "Write the smallest direct implementation, name the expected variation, and sketch the diff needed when that variation arrives. Compare failure handling and testing with the proposed pattern. If the extra structure only renames a method and every change still edits all layers, defer it. If it isolates an unstable payment SDK or creates one enforceable consistency boundary, the immediate value may justify it.",
    example: "A two-line date formatter rarely needs a factory and strategy registry. A single external payment adapter can still justify a port because timeout ambiguity, testing and provider credentials are real concerns today.",
    implications: "Record the signal that would warrant revisiting the decision, such as a second independent policy or repeated changes across multiple modules. This keeps the decision reversible."
  },
};

// Older viewer pages iterate paragraphs; newer pages read the named sections.
// Keep both interfaces on each entry when HTML and data refresh independently.
for (const [id, lesson] of Object.entries(window.ASTRA_EXPLANATIONS)) {
  const paragraphs = [
    lesson.overview, lesson.question, lesson.walkthrough, lesson.example, lesson.implications
  ];
  window.ASTRA_EXPLANATIONS[id] = Object.assign(paragraphs, lesson);
}
