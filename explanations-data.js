/* Deep-dive explanations, keyed by the tracker's item id (area + topic).
   HTML is injected into explanations.html. Angle brackets inside code are
   escaped (&lt; &gt;) because the content is set via innerHTML.
   Part 1 — Caching (areas 1 & 2). More areas added over time. */
window.EXPLANATIONS = {

/* ============ AREA 1 — CACHING STRATEGIES ============ */

"caching-strategies__cache-aside-lazy-loading-read-on-miss-load-populate": `
<p class="lead">The application owns the cache. Reads check the cache first; on a miss the app loads from the database, writes the value back with a TTL, and returns it. It is the default caching pattern in .NET.</p>

<h2>How it works</h2>
<p>Three steps on read, and an invalidation on write. The cache never talks to the database — your code orchestrates both.</p>
<pre><code>// READ
var cached = await _cache.StringGetAsync(key);
if (cached.HasValue) return Deserialize(cached);   // cache hit
var data = await _db.LoadAsync(id);                 // miss -> source of truth
await _cache.StringSetAsync(key, Serialize(data), ttl);  // populate + TTL
return data;

// WRITE (prefer delete over update-in-place)
await _db.SaveAsync(entity);
await _cache.KeyDeleteAsync(key);   // next read repopulates fresh</code></pre>

<h2>Why it is the default</h2>
<ul>
<li><strong>Resilient:</strong> if the cache is down, reads just fall through to the DB — a cache outage is not a data outage.</li>
<li><strong>Only caches what is used:</strong> cold data never occupies memory.</li>
<li><strong>Simple mental model:</strong> the cache is a lazily-filled copy, the DB is the source of truth.</li>
</ul>

<h2>Trade-offs &amp; gotchas</h2>
<ul>
<li><strong>Cold start / first-read miss:</strong> the very first request for a key always pays the DB cost. Optionally warm hot keys on startup.</li>
<li><strong>Staleness:</strong> bounded by the TTL. Shorten TTL or invalidate on write for freshness.</li>
<li><strong>Dual-write race:</strong> if you <em>update</em> the cache on write (instead of deleting), a concurrent read can re-populate a stale value after your update. <strong>Delete the key instead</strong> and let the next read rebuild it.</li>
<li><strong>Stampede:</strong> when a hot key expires, thousands of concurrent misses hammer the DB at once — see cache stampede / breakdown.</li>
</ul>

<div class="say"><strong>Say this:</strong> "I default to cache-aside. On writes I delete the key rather than update it in place — deleting avoids the lost-update race between my write and a concurrent read — and I protect hot keys from stampede with a per-key rebuild lock plus TTL jitter."</div>

<h2>Follow-ups they may ask</h2>
<ul>
<li>Delete vs update the cache on write? (delete — avoids the stale-repopulation race)</li>
<li>How do you avoid a stampede on expiry? (per-key lock / single-flight, stale-while-revalidate, jittered TTL)</li>
<li>Cache-aside vs read-through? (who contains the load logic — your app vs the cache library)</li>
</ul>
`,

"caching-strategies__read-through-the-cache-loads-from-db-on-a-miss": `
<p class="lead">Same read path as cache-aside, but the <em>cache layer</em> (a provider/library) loads from the database on a miss, not your application code. The caller just asks the cache and always gets a value.</p>

<h2>How it differs from cache-aside</h2>
<p>With cache-aside the application contains the "on miss, load from DB and populate" logic. With read-through that logic lives behind the cache abstraction (a <code>GetOrCreate</code>-style API or a dedicated caching product). The observable behaviour is nearly identical; the difference is <em>where the load code lives</em>.</p>
<pre><code>// Read-through style: the factory is the "load from source" logic,
// invoked by the cache only on a miss.
var data = await _cache.GetOrCreateAsync(key, async entry =&gt; {
    entry.AbsoluteExpirationRelativeToNow = ttl;
    return await _db.LoadAsync(id);
});</code></pre>
<p>In .NET, <code>IMemoryCache.GetOrCreateAsync</code> and <code>HybridCache</code> (.NET 9) give you read-through semantics; distributed caches like NCache offer true read-through with a provider you register.</p>

<h2>Trade-offs</h2>
<table>
<tr><th></th><th>Cache-aside</th><th>Read-through</th></tr>
<tr><td>Load logic</td><td>In your app</td><td>Behind the cache</td></tr>
<tr><td>Consistency of access</td><td>Each call site must remember the pattern</td><td>Centralised — one code path</td></tr>
<tr><td>Coupling</td><td>App knows the DB</td><td>Cache knows the DB (provider)</td></tr>
</table>
<ul>
<li><strong>Pro:</strong> one place for the load + populate logic; call sites can't forget to populate.</li>
<li><strong>Con:</strong> couples the cache layer to your data source; harder to apply per-query shaping.</li>
<li>Same freshness/stampede concerns as cache-aside — a provider with built-in single-flight helps.</li>
</ul>

<div class="say"><strong>Say this:</strong> "Read-through is cache-aside with the load logic pushed into the cache layer — the big win is that no call site can forget to populate. In .NET I get it from <code>GetOrCreateAsync</code> or <code>HybridCache</code>, which also dedups concurrent misses for me."</div>
`,

"caching-strategies__write-through-write-cache-db-synchronously": `
<p class="lead">On a write, the cache and the database are updated <em>synchronously</em> in the same operation. The cache is always consistent with the DB for written keys, at the cost of write latency.</p>

<h2>How it works</h2>
<pre><code>// Write-through: both stores updated before returning
await _db.SaveAsync(entity);
await _cache.StringSetAsync(key, Serialize(entity), ttl);
// read is now guaranteed to hit a fresh value</code></pre>
<p>Often paired with read-through: writes keep the cache fresh, reads are served from it. Good when the same records are read soon and often after being written.</p>

<h2>Trade-offs</h2>
<ul>
<li><strong>Pro:</strong> the cache never serves a stale written value; reads right after a write are warm.</li>
<li><strong>Con:</strong> every write pays two round-trips (DB + cache) → higher write latency.</li>
<li><strong>Con:</strong> writes cache data that may never be read again (write amplification / pollution).</li>
<li><strong>Consistency hazard:</strong> two stores, no distributed transaction — if the cache write fails after the DB commit you can diverge. Mitigate by writing DB first, then <em>deleting</em> the key (degrades to cache-aside) rather than writing a possibly-stale value, or accept a short TTL as a backstop.</li>
</ul>

<div class="say"><strong>Say this:</strong> "Write-through buys read-after-write consistency at the price of write latency. Because there's no transaction across DB and cache, I commit the DB first and treat the cache write as best-effort — on failure I delete the key so the next read rebuilds it."</div>

<h2>When to choose it</h2>
<p>Read-heavy data that is read again quickly after each write (user profile, config). Avoid for write-heavy data that is rarely re-read — you'd just be polluting the cache.</p>
`,

"caching-strategies__write-behind-write-back-async-flush-to-db": `
<p class="lead">Write to the cache immediately and acknowledge the caller; flush to the database <em>asynchronously</em> later (batched/coalesced). Fastest writes, but you risk losing un-flushed data if the cache dies.</p>

<h2>How it works</h2>
<p>The write returns as soon as the cache is updated. A background process drains a queue of dirty entries to the DB — often <strong>coalescing</strong> many updates to the same key into one write and <strong>batching</strong> across keys.</p>
<pre><code>// write path: update cache, enqueue the DB flush, return
await _cache.StringSetAsync(key, Serialize(entity), ttl);
_flushChannel.Writer.TryWrite(entity.Id);   // async, batched drain elsewhere</code></pre>

<h2>Trade-offs</h2>
<ul>
<li><strong>Pro:</strong> very low write latency; absorbs write bursts; batching/coalescing cuts DB load dramatically (great for counters, metrics, "last seen").</li>
<li><strong>Con — durability:</strong> data acked to the user but not yet flushed is <em>lost</em> if the cache node crashes before flush. Only use where that loss is tolerable, or back it with a durable log.</li>
<li><strong>Con — complexity:</strong> ordering, retries, and failure handling of the async flush; reads from the DB can lag the cache.</li>
</ul>

<div class="say"><strong>Say this:</strong> "Write-behind trades durability for write speed — I'd use it for high-volume, loss-tolerant data like view counts or 'last active', with coalescing so a thousand increments become one DB write. For anything I can't lose, I don't use write-behind."</div>

<h2>Strategy cheat-sheet</h2>
<table>
<tr><th>Pattern</th><th>Freshness</th><th>Write cost</th><th>Risk</th></tr>
<tr><td>Cache-aside</td><td>TTL-bounded</td><td>low</td><td>stale / stampede</td></tr>
<tr><td>Write-through</td><td>always fresh</td><td>high (2 writes)</td><td>pollution</td></tr>
<tr><td>Write-behind</td><td>fresh in cache</td><td>lowest</td><td>data loss on crash</td></tr>
</table>
`,

/* ============ AREA 2 — REDIS & CACHING PROBLEMS ============ */

"redis-caching-problems__redis-unavailable-at-peak-fail-open-vs-fail-closed": `
<p class="lead">Redis is a shared dependency (L2 cache, locks, rate limits). If it's down, every call that touches it blocks on a timeout or throws. The design question is whether each use <strong>fails open</strong> (continue without Redis) or <strong>fails closed</strong> (reject).</p>

<h2>The danger: turning a cache outage into a full outage</h2>
<p>If reads simply fall through to the DB, a Redis outage sends <em>all</em> traffic to the database at once (a thundering herd). Timeouts pile up, the thread pool starves, and the whole service degrades — the cache outage cascades.</p>

<h2>Decide fail-open vs fail-closed per use</h2>
<ul>
<li><strong>Caching → fail open.</strong> Short connect/command timeouts, treat a Redis error as a cache miss, serve from the DB. Protect the DB with a request coalescer (single-flight) and a small in-process L1 so the herd is bounded.</li>
<li><strong>Distributed lock / rate limiter → fail closed (or degrade deliberately).</strong> Silently skipping a lock breaks correctness; silently skipping a limiter invites abuse. Reject, or fall back to a conservative local limiter.</li>
</ul>

<h2>Mechanics</h2>
<pre><code>try {
    var v = await _cache.StringGetAsync(key);   // short timeouts configured
    if (v.HasValue) return Deserialize(v);
}
catch (RedisException) { /* fail open: fall through to DB */ }

return await _coalescer.GetOrLoadAsync(key, () =&gt; _db.LoadAsync(id));</code></pre>
<p>Wrap Redis calls in a <strong>circuit breaker</strong> (Polly) so you stop hammering a dead node, and add a <strong>local fallback</strong> (in-memory limiter/cache) for the fail-closed cases.</p>

<div class="say"><strong>Say this:</strong> "I decide fail-open vs fail-closed per key: the cache fails open, locks and limiters fail closed. I pair short timeouts with a circuit breaker and request coalescing so a Redis outage doesn't become a database stampede."</div>

<h2>Follow-ups</h2>
<ul>
<li>How do you stop the DB herd when Redis dies? (coalescing + L1 + circuit breaker)</li>
<li>Why not fail open on a lock? (you'd lose mutual exclusion → double processing)</li>
</ul>
`,

"redis-caching-problems__cache-aside-avoiding-a-stampede": `
<p class="lead">A stampede (dogpile / thundering herd) happens when a hot key expires and thousands of concurrent requests all miss and rebuild it from the DB at the same instant. Fix it by letting <em>one</em> caller rebuild while others wait or serve stale.</p>

<h2>Three fixes — combine them</h2>
<ol>
<li><strong>Single-flight / per-key rebuild lock.</strong> Only one caller rebuilds; the rest await the result or get the previous value. Across replicas use a short Redis lock (<code>SET key token NX PX</code>); within one process a <code>SemaphoreSlim</code> keyed per entry.</li>
<li><strong>Stale-while-revalidate.</strong> Serve the old value past expiry and refresh in the background, so no request ever blocks on a rebuild.</li>
<li><strong>Jittered TTL.</strong> Add randomness to expiries so many keys don't die on the same tick (this is the fix for <em>avalanche</em>).</li>
</ol>

<pre><code>// Per-key single-flight inside one process
private static readonly ConcurrentDictionary&lt;string, SemaphoreSlim&gt; _gates = new();

async Task&lt;T&gt; GetAsync&lt;T&gt;(string key, Func&lt;Task&lt;T&gt;&gt; load) {
    var hit = await _cache.StringGetAsync(key);
    if (hit.HasValue) return Deserialize&lt;T&gt;(hit);

    var gate = _gates.GetOrAdd(key, _ =&gt; new SemaphoreSlim(1,1));
    await gate.WaitAsync();
    try {
        hit = await _cache.StringGetAsync(key);       // double-check after waiting
        if (hit.HasValue) return Deserialize&lt;T&gt;(hit);
        var data = await load();                       // only one caller gets here
        await _cache.StringSetAsync(key, Serialize(data), Jitter(ttl));
        return data;
    } finally { gate.Release(); }
}</code></pre>

<div class="warn"><strong>Key insight:</strong> a <code>SemaphoreSlim</code> only coordinates tasks <em>inside one process</em>. With multiple replicas you still get one rebuild <em>per replica</em> unless the lock lives in Redis (<code>SET NX</code>).</div>

<div class="say"><strong>Say this:</strong> "Stampede is a hot key expiring under concurrency. I combine a per-key single-flight rebuild, stale-while-revalidate so readers never block, and jittered TTLs. The nuance: an in-process semaphore gives one rebuild per replica; to get one rebuild cluster-wide the lock has to be in Redis."</div>
`,

"redis-caching-problems__distributed-lock-with-redis-pitfalls-fencing": `
<p class="lead">Acquire a lock with <code>SET key uniqueToken NX PX 30000</code> — atomic "set if not exists" with an expiry. The token proves ownership; release with a Lua compare-and-delete. The trap is the TTL: if work outruns it, two workers run at once.</p>

<h2>Acquire &amp; release</h2>
<pre><code>// acquire: NX = only if absent, PX = expiry in ms, token = ownership proof
bool ok = await db.StringSetAsync(key, token, TimeSpan.FromSeconds(30),
                                  When.NotExists);

// release: delete ONLY if the value is still our token (atomic, in Lua)
const string unlock = @"if redis.call('get', KEYS[1]) == ARGV[1]
                        then return redis.call('del', KEYS[1]) else return 0 end";
await db.ScriptEvaluateAsync(unlock, new RedisKey[]{key}, new RedisValue[]{token});</code></pre>

<h2>What goes wrong</h2>
<ul>
<li><strong>Lease expiry mid-work:</strong> if your work runs past the TTL, the lock expires, another worker acquires it, and now two run concurrently. Keep work shorter than the TTL, or run a <strong>watchdog</strong> that renews (extends) the lease while alive.</li>
<li><strong>Deleting someone else's lock:</strong> a naive <code>DEL</code> on release can delete a lock a different owner now holds. Always compare-and-delete by token (the Lua above).</li>
<li><strong>Failover:</strong> a single-node lock can lose mutual exclusion during primary failover (the new primary hasn't got the key yet).</li>
</ul>

<h2>Fencing tokens — the real safety</h2>
<p>A lock gives mutual exclusion <em>only if nothing runs past the TTL</em>. For correctness-critical writes, hand out a monotonically increasing <strong>fencing token</strong> with the lock and have the protected resource reject any write carrying a token lower than the highest it has seen. That way a stale lock holder's late write is refused even if it still "thinks" it holds the lock.</p>

<div class="warn"><strong>Redlock debate:</strong> the multi-node Redlock algorithm adds availability but its correctness under clock skew/GC pauses is disputed (Kleppmann). For most app needs a single-node lock + fencing token is simpler and safer. True correctness lives at the resource, not the lock.</div>

<div class="say"><strong>Say this:</strong> "SET NX PX with a unique token, release via Lua compare-and-delete, renew with a watchdog for long work. But a lock only guarantees exclusion if nothing overruns the TTL — fencing tokens checked at the resource are what make it actually safe."</div>
`,

"redis-caching-problems__concurrent-key-update-atomic-ops-watch-multi-lua": `
<p class="lead">Each Redis <em>command</em> is atomic (single-threaded server), but a read-modify-write in your <em>app</em> is not: two clients GET the same value, modify, and SET — the second overwrites the first (lost update). Fix it by making the mutation atomic on the server.</p>

<h2>Three ways to make it safe</h2>
<ul>
<li><strong>Atomic server-side ops:</strong> push the mutation into Redis. <code>INCR</code>/<code>INCRBY</code>/<code>HINCRBY</code> for counters; set/hash/sorted-set commands instead of rewriting a blob. Fastest and simplest — no race at all.</li>
<li><strong>Lua script:</strong> read + modify + write in one atomic server-side step for logic Redis has no single command for. Keep it short (it blocks the single thread).</li>
<li><strong>Optimistic concurrency with <code>WATCH</code> + <code>MULTI</code>/<code>EXEC</code>:</strong> watch the key; the transaction aborts if it changed before <code>EXEC</code>; you retry.</li>
</ul>

<pre><code>// BAD: read-modify-write in the app -> lost update under concurrency
var n = (int)await db.StringGetAsync(key);
await db.StringSetAsync(key, n + 1);

// GOOD: atomic on the server
await db.StringIncrementAsync(key);        // INCR
await db.HashIncrementAsync(h, "f", 1);    // HINCRBY</code></pre>

<table>
<tr><th>Approach</th><th>Best for</th><th>Cost</th></tr>
<tr><td>Atomic op (INCR, ZADD…)</td><td>counters, sets, sorted sets</td><td>cheapest, no retry</td></tr>
<tr><td>Lua script</td><td>custom read-modify-write</td><td>flexible; blocks the thread — keep short</td></tr>
<tr><td>WATCH/MULTI/EXEC</td><td>general optimistic update</td><td>can livelock under high contention</td></tr>
</table>

<div class="say"><strong>Say this:</strong> "Individual commands are atomic, but my app's read-modify-write isn't — that's a lost update. I push the mutation server-side: INCR/HINCRBY for counters, a short Lua script for custom logic, or WATCH/MULTI/EXEC for optimistic updates with retry."</div>
`,

"redis-caching-problems__redis-transactions-multi-exec-watch-lua-scripts": `
<p class="lead">Redis transactions aren't like SQL. <code>MULTI</code>…<code>EXEC</code> queues commands and runs them atomically and in isolation — but there is <strong>no rollback</strong>. <code>WATCH</code> adds optimistic concurrency; Lua scripts are the practical "stored procedure".</p>

<h2>MULTI / EXEC</h2>
<ul>
<li>Commands between <code>MULTI</code> and <code>EXEC</code> are <strong>queued</strong>, then executed back-to-back with no other client interleaving (isolation).</li>
<li><strong>No rollback:</strong> if a command fails at runtime (e.g. wrong type), the others still run. Redis treats such failures as programmer error, not a reason to undo.</li>
<li><code>DISCARD</code> abandons a queued transaction before <code>EXEC</code>.</li>
</ul>

<h2>WATCH — optimistic concurrency</h2>
<pre><code>WATCH balance
val = GET balance            // read
if (val &lt; amount) { UNWATCH; return insufficient; }
MULTI
DECRBY balance amount         // queued
EXEC                          // nil if 'balance' changed since WATCH -&gt; retry</code></pre>
<p><code>EXEC</code> returns nil (the transaction is aborted) if any watched key was modified by someone else between <code>WATCH</code> and <code>EXEC</code>. You loop and retry — classic compare-and-swap.</p>

<h2>Lua scripts (EVAL)</h2>
<p>A script runs atomically and in isolation on the single server thread, with full read-modify-write logic and conditionals. It's usually simpler and faster than WATCH-retry loops and avoids round-trips. Keep scripts short — a long script blocks every other client. Scripts are cached by SHA (<code>EVALSHA</code>).</p>

<div class="say"><strong>Say this:</strong> "Redis MULTI/EXEC gives atomicity and isolation but no rollback — failed commands don't undo the rest. For conditional logic I prefer a short Lua script (atomic, one round-trip) over a WATCH/EXEC retry loop, which can livelock under contention."</div>
`,

"redis-caching-problems__stackexchange-redis-correct-usage-singleton-multiplexer-timeouts": `
<p class="lead"><code>ConnectionMultiplexer</code> is expensive, thread-safe, and multiplexes all commands over a few connections. Create it <strong>once</strong> as a singleton. Creating one per request exhausts sockets and destroys performance.</p>

<h2>The rules</h2>
<ul>
<li><strong>Singleton multiplexer.</strong> Register <code>IConnectionMultiplexer</code> once in DI; get a cheap <code>IDatabase</code> per operation.</li>
<li><strong>Prefer async</strong> (<code>StringGetAsync</code>) — sync calls under load cause timeouts and thread-pool pressure.</li>
<li><strong>Set sensible timeouts</strong> (connect, sync/async op) so a slow Redis fails fast instead of hanging threads.</li>
<li><strong>Handle <code>RedisConnectionException</code> / <code>RedisTimeoutException</code></strong> as a cache miss (fail open) behind a circuit breaker.</li>
</ul>
<pre><code>services.AddSingleton&lt;IConnectionMultiplexer&gt;(_ =&gt;
    ConnectionMultiplexer.Connect(new ConfigurationOptions {
        EndPoints = { "redis:6379" },
        ConnectTimeout = 2000,
        SyncTimeout = 1000,
        AbortOnConnectFail = false     // keep retrying in the background
    }));

// per-operation
var db = _mux.GetDatabase();
var v = await db.StringGetAsync(key);</code></pre>

<div class="warn"><strong>The counter-intuitive cause of Redis timeouts:</strong> very often it is <em>not</em> Redis. Sync-over-async elsewhere in the app (<code>.Result</code>, <code>.Wait()</code>) starves the thread pool, which delays StackExchange.Redis's completion callbacks — surfacing as <code>RedisTimeoutException</code>. Fix the blocking calls, not Redis.</div>

<div class="say"><strong>Say this:</strong> "One <code>ConnectionMultiplexer</code> as a singleton, async all the way, short timeouts, and treat connection/timeout exceptions as a cache miss. And when I see Redis timeouts in production I look at client-side thread-pool starvation first — it's the usual culprit, not the server."</div>
`,

"redis-caching-problems__redis-data-structures-atomic-server-side-commands": `
<p class="lead">Pick the Redis data structure that lets the server do your operation <em>atomically</em>, instead of reading a blob into your app, mutating it, and writing it back (which races).</p>

<h2>Structure → job</h2>
<table>
<tr><th>Structure</th><th>Use for</th><th>Key commands</th></tr>
<tr><td>String</td><td>cached blob, counter, flag</td><td>GET/SET, INCR, SETNX</td></tr>
<tr><td>Hash</td><td>object fields (update one field without rewriting the whole object)</td><td>HSET, HGET, HINCRBY</td></tr>
<tr><td>List</td><td>simple queue/stack, recent-items feed</td><td>LPUSH, RPOP, LRANGE</td></tr>
<tr><td>Set</td><td>unique membership, tags, "is online"</td><td>SADD, SISMEMBER, SINTER</td></tr>
<tr><td>Sorted set (ZSET)</td><td>leaderboards, priority queues, sliding-window rate limits (score = timestamp)</td><td>ZADD, ZRANGE, ZREMRANGEBYSCORE</td></tr>
<tr><td>Bitmap / HyperLogLog</td><td>compact flags; approximate unique counts at tiny memory</td><td>SETBIT, PFADD, PFCOUNT</td></tr>
<tr><td>Stream</td><td>durable log with consumer groups</td><td>XADD, XREADGROUP, XACK</td></tr>
</table>

<h2>Why it matters</h2>
<p>Storing an object as a JSON <em>String</em> forces a read-modify-write to change one field — that's a lost-update race and extra bandwidth. Store it as a <em>Hash</em> and <code>HINCRBY</code>/<code>HSET</code> one field atomically. A sliding-window rate limiter is a <em>ZSET</em> of timestamps, trimmed with <code>ZREMRANGEBYSCORE</code> — all server-side.</p>

<div class="say"><strong>Say this:</strong> "The lead instinct is to pick the structure that lets Redis mutate it atomically server-side — a Hash so I update one field, a ZSET for leaderboards and sliding-window limits — rather than round-tripping a blob and racing on a read-modify-write."</div>
`,

"redis-caching-problems__pub-sub-vs-redis-streams": `
<p class="lead">Pub/Sub is fire-and-forget: messages go only to subscribers connected <em>right now</em>, nothing is stored. Streams are an append-only log with IDs: messages persist, support consumer groups, acknowledgements, and replay.</p>

<h2>Pub/Sub</h2>
<ul>
<li>No persistence, no replay, no acks, no consumer groups.</li>
<li>If a subscriber is down or reconnecting, it <strong>misses</strong> messages.</li>
<li>Great for cheap, lossy, real-time fan-out: cache-invalidation notifications across replicas, presence signals.</li>
</ul>

<h2>Streams</h2>
<ul>
<li>Append-only log; each entry has an ID. Messages persist (subject to trimming).</li>
<li><strong>Consumer groups</strong> split work across consumers; <strong>XACK</strong> acknowledges; a <strong>pending-entries list (PEL)</strong> tracks un-acked messages for crash recovery; <strong>XCLAIM</strong> reassigns stuck ones.</li>
<li>Replay from any ID; catch up after downtime. A lightweight at-least-once queue without a full broker.</li>
</ul>

<table>
<tr><th></th><th>Pub/Sub</th><th>Streams</th></tr>
<tr><td>Delivery</td><td>at-most-once (lossy)</td><td>at-least-once</td></tr>
<tr><td>Persistence / replay</td><td>none</td><td>yes</td></tr>
<tr><td>Consumer groups / ack</td><td>no</td><td>yes</td></tr>
<tr><td>Offline subscriber</td><td>misses messages</td><td>catches up</td></tr>
</table>

<div class="say"><strong>Say this:</strong> "Pub/Sub for cheap lossy fan-out like cross-node cache invalidation; Streams when I need at-least-once delivery, work distribution, and catch-up after downtime. For real durability guarantees, though, I'd reach for Azure Service Bus rather than Redis — using the right tool signals judgement."</div>
`,

"redis-caching-problems__pipelining-single-threaded-execution-scan-not-keys": `
<p class="lead">Redis executes commands one at a time on a single thread — that's why every command is atomic, and why one slow command blocks everyone. Pipelining hides network latency; <code>SCAN</code> replaces the blocking <code>KEYS</code>.</p>

<h2>Single-threaded implications</h2>
<ul>
<li>Each command is atomic and easy to reason about — no per-command locking needed.</li>
<li>A single slow/O(N) command stalls the whole server: <code>KEYS *</code> on a big keyspace, a long Lua script, <code>SMEMBERS</code> on a huge set, <code>HGETALL</code> on a huge hash.</li>
<li>Throughput comes from being in-memory + pipelining, not threads. (Redis 6+ added threaded <em>I/O</em>, but command <em>execution</em> is still single-threaded.) Scale out with Cluster, not more cores.</li>
</ul>

<h2>Never run KEYS in production</h2>
<p><code>KEYS pattern</code> is O(N) over the entire keyspace and blocks the server. Use <strong><code>SCAN</code></strong> — a cursor-based, non-blocking iterator that returns keys in small batches.</p>
<pre><code>// StackExchange.Redis exposes SCAN via server.Keys(...)
var server = mux.GetServer(endpoint);
foreach (var key in server.Keys(pattern: "tenant:42:*", pageSize: 250))
    { /* process incrementally */ }</code></pre>

<h2>Pipelining</h2>
<p>Send many commands without waiting for each reply, then read all replies — collapsing N round-trips into ~1. Over real network latency this is a huge win. Use <code>MGET</code>/<code>MSET</code> for multi-key ops. StackExchange.Redis pipelines implicitly through its multiplexed async API; <code>CreateBatch</code>/<code>CreateTransaction</code> group explicitly. (Pipelining is not atomic unless wrapped in MULTI/EXEC.)</p>

<div class="say"><strong>Say this:</strong> "'My Redis is slow' is usually N sequential round-trips, not Redis — pipelining or MGET fixes it. And because Redis is single-threaded I never run KEYS in prod; I use SCAN so one command can't stall the server."</div>
`,

"redis-caching-problems__eviction-policies-ttl-persistence": `
<p class="lead">Match the memory policy to the instance's role. A pure cache uses LRU/LFU eviction and little or no persistence; a lock/queue/source-of-truth store uses <code>noeviction</code> and durable persistence.</p>

<h2>TTL</h2>
<p>Per-key expiry. Cache keys should almost always have one; <strong>jitter</strong> them so many keys don't expire on the same tick (prevents avalanche).</p>

<h2>Eviction (when <code>maxmemory</code> is hit)</h2>
<table>
<tr><th>Policy</th><th>Behaviour</th><th>Use for</th></tr>
<tr><td>noeviction</td><td>reject writes (OOM error)</td><td>lock / queue / source of truth</td></tr>
<tr><td>allkeys-lru / allkeys-lfu</td><td>evict least-recently / least-frequently used</td><td>a pure cache</td></tr>
<tr><td>volatile-lru / -lfu / -ttl</td><td>only evict keys that have a TTL</td><td>mixed cache + durable keys</td></tr>
</table>
<p>LFU resists <em>cache pollution</em> (a burst of one-off keys evicting genuinely hot data) better than LRU.</p>

<h2>Persistence</h2>
<ul>
<li><strong>RDB:</strong> periodic point-in-time snapshots. Fast restart, but can lose the last few minutes.</li>
<li><strong>AOF:</strong> append every write. More durable, larger, slower replay. Tunable fsync (everysec is the usual balance).</li>
<li>Run both for durability; a pure cache often needs neither.</li>
</ul>

<div class="say"><strong>Say this:</strong> "Match policy to role: a cache uses allkeys-lru (or lfu) and no persistence; a lock or stream store uses noeviction plus AOF. And every cache key gets a jittered TTL so expiries don't synchronise into an avalanche."</div>
`,

"redis-caching-problems__cluster-sentinel-replication-failover": `
<p class="lead">Replication gives read-scaling and failover candidates; Sentinel automates failover for a single dataset; Cluster shards the keyspace across many primaries for horizontal scale. All three share one truth: async replication means a failover can lose the newest writes.</p>

<h2>Replication</h2>
<p>One primary, N replicas (async by default). Replicas serve reads and are failover candidates. Because replication is asynchronous, writes acked by the primary but not yet shipped to a replica can be <strong>lost</strong> if the primary dies before replicating.</p>

<h2>Sentinel</h2>
<p>A set of Sentinel processes monitor a primary/replica group, agree (quorum) when the primary is down, promote a replica, and provide service discovery to clients. <strong>No sharding</strong> — it's high availability for one dataset.</p>

<h2>Cluster</h2>
<p>Shards the keyspace across <strong>16384 hash slots</strong> spread over multiple primaries (each with replicas). Scales writes and memory horizontally. Multi-key operations must land in the same slot — use <strong>hash tags</strong> <code>{...}</code> (e.g. <code>user:{42}:profile</code> and <code>user:{42}:cart</code> share a slot) so MGET/transactions work.</p>

<div class="warn"><strong>Failure window:</strong> during failover there's a brief window where writes can be lost or rejected. So clients need retries, and anything correctness-critical (locks) needs <strong>fencing tokens</strong> — the lock alone isn't safe across a failover.</div>

<div class="say"><strong>Say this:</strong> "Replication for read-scale and HA candidates, Sentinel to automate failover of one dataset, Cluster to shard across 16384 slots for horizontal scale. Replication is async, so a failover can drop the latest writes — my clients retry and my locks are fenced."</div>
`,

"redis-caching-problems__cache-invalidation-stale-data": `
<p class="lead">"There are two hard things in computer science..." — invalidation is one of them because the two hard parts are <em>what</em> to invalidate and <em>when</em>. Strategies, roughly by staleness tolerance:</p>

<h2>Strategies</h2>
<ul>
<li><strong>TTL only:</strong> simplest; accept a bounded staleness window. Jitter TTLs to avoid synchronised expiry.</li>
<li><strong>Explicit on write:</strong> delete the key when the source changes. <strong>Prefer delete over update-in-place</strong> — an update can race a concurrent read that re-writes a stale value right after you update.</li>
<li><strong>Event-driven:</strong> publish an invalidation (Redis Pub/Sub, or a broker) so every instance drops its in-memory L1 copy — required for multi-replica in-process caches.</li>
<li><strong>Versioned / namespaced keys:</strong> bump a version (<code>user:42:v7:*</code>); old entries are simply abandoned and age out. Great for invalidating a whole group at once.</li>
</ul>

<h2>The dual-write ordering hazard</h2>
<p>Updating the DB and the cache are two operations with no shared transaction. If you write the cache then the DB (or update the cache with a value a slower read later overwrites), you can leave a stale entry. Safer ordering: <strong>commit the DB first, then delete the cache key</strong>; the next read rebuilds from the source. (Same hazard family as the outbox/dual-write problem.)</p>

<div class="say"><strong>Say this:</strong> "I invalidate by deleting, not updating — deleting avoids the stale-repopulation race. For multi-replica L1 caches I publish invalidations over Pub/Sub, and for group invalidation I bump a version in the key namespace. TTL is always there as a backstop."</div>
`,

"redis-caching-problems__multi-tenant-caching-monitoring": `
<p class="lead">In a multi-tenant system a cache that returns another tenant's data is a <strong>data breach</strong>, not just a bug. Namespace every key by tenant, keep one noisy tenant from evicting everyone's hot data, and invalidate per tenant.</p>

<h2>Isolation — treat it as a security property</h2>
<ul>
<li><strong>Namespace every key by tenant:</strong> <code>tenant:{id}:entity:{key}</code>. No code path should build a key without the tenant segment. Consider a typed key builder so it can't be forgotten.</li>
<li>For strong isolation of large/regulated tenants, use a <strong>separate logical DB or instance</strong>.</li>
</ul>

<h2>Fairness — the noisy-neighbour problem</h2>
<p>One tenant hammering the cache shouldn't evict everyone else's hot data. Options: per-tenant quotas/limits, LFU eviction, or dedicated instances for very large tenants.</p>

<h2>Scoped invalidation</h2>
<p>Bump a per-tenant version/namespace to invalidate just that tenant's entries (e.g. <code>tenant:{id}:v{n}:*</code>).</p>

<h2>Monitoring — what to watch</h2>
<ul>
<li><strong>Hit ratio</strong> (overall and ideally per tenant) — a sudden drop signals a stampede or bad invalidation.</li>
<li><strong>Memory + evictions</strong> (<code>evicted_keys</code>), <strong>OOM</strong> rejections.</li>
<li><strong>Latency / slowlog</strong> (O(N) commands, big keys), <strong>connected clients</strong>, <strong>keyspace size</strong>.</li>
<li><strong>Timeouts / connection errors</strong> on the client side.</li>
</ul>

<div class="say"><strong>Say this:</strong> "I treat tenant isolation in the cache as a security property, not a convenience — every key is namespaced by tenant via a key builder that can't be bypassed, big tenants get their own instance, and I watch per-tenant hit ratio, evictions and slowlog so a noisy neighbour or a stampede shows up fast."</div>
`,

"redis-caching-problems__redis-as-a-queue-vs-a-dedicated-broker": `
<p class="lead">Redis Lists (simple queue) and Streams (consumer groups, ack, replay) can act as a lightweight queue. Versus a dedicated broker (Azure Service Bus, RabbitMQ, Kafka), Redis lacks strong durability, rich routing, built-in dead-lettering, and large-scale persistence by default.</p>

<h2>When Redis is enough</h2>
<ul>
<li>You already run Redis and want something simple and fast.</li>
<li>Losing the odd message is tolerable (or you use Streams for at-least-once).</li>
<li>Small-to-moderate backlogs, in-process-ish work distribution.</li>
</ul>
<p>List queue: <code>LPUSH</code> + <code>BRPOP</code> (blocking pop). Streams queue: <code>XADD</code> + consumer groups + <code>XACK</code> + a pending list for recovery.</p>

<h2>When you need a dedicated broker</h2>
<ul>
<li>Mission-critical delivery guarantees, transactions, ordering/sessions.</li>
<li>Built-in dead-letter queues, retry policies, scheduled/deferred messages.</li>
<li>Large backlogs, long retention, fan-out at scale, rich routing (topics/subscriptions).</li>
</ul>

<table>
<tr><th></th><th>Redis List/Stream</th><th>Service Bus / Rabbit / Kafka</th></tr>
<tr><td>Durability</td><td>limited by default</td><td>strong</td></tr>
<tr><td>DLQ / retry</td><td>DIY</td><td>built-in</td></tr>
<tr><td>Routing</td><td>minimal</td><td>rich (topics, bindings)</td></tr>
<tr><td>Ops cost</td><td>already have it</td><td>another system</td></tr>
</table>

<div class="say"><strong>Say this:</strong> "Redis Streams make a fine lightweight queue when I already run Redis and can tolerate its weaker guarantees. For durable, mission-critical messaging with DLQ, ordering and retries I'd use Azure Service Bus and keep Redis for cache, locks and ephemeral queues. Right tool for the job."</div>
`,

"redis-caching-problems__cache-penetration-negative-caching": `
<p class="lead">Penetration is when requests ask for keys that <em>don't exist</em> in the cache <em>or</em> the database — every one misses the cache and hits the DB. Common with invalid IDs, scraping, or a malicious probe. The cache gives no protection because there's nothing to cache... unless you cache the "not found".</p>

<h2>Fixes</h2>
<ul>
<li><strong>Negative caching:</strong> cache a sentinel "miss" marker for absent keys with a <em>short</em> TTL, so repeated lookups for the same missing id are served from the cache, not the DB. Keep the TTL short so a later-created record isn't masked for long.</li>
<li><strong>Bloom filter (or cuckoo filter):</strong> keep a compact probabilistic set of all keys that <em>could</em> exist; if the filter says "definitely not present", short-circuit before touching cache or DB. No false negatives, small false-positive rate.</li>
<li><strong>Input validation / auth / rate limiting:</strong> reject obviously invalid ids (format, range) and throttle abusive clients at the edge.</li>
</ul>
<pre><code>var v = await _cache.StringGetAsync(key);
if (v == NULL_SENTINEL) return null;          // negative cache hit
if (v.HasValue) return Deserialize(v);
var data = await _db.LoadAsync(id);
await _cache.StringSetAsync(key,
    data is null ? NULL_SENTINEL : Serialize(data),
    data is null ? shortTtl : ttl);           // cache the miss, briefly
return data;</code></pre>

<div class="warn"><strong>Watch out:</strong> unbounded negative caching of attacker-chosen ids can itself fill memory — cap it, use a short TTL, and prefer a Bloom filter when the valid key set is large and known.</div>

<div class="say"><strong>Say this:</strong> "Penetration is misses for keys that exist nowhere, so the cache can't help — unless I cache the absence. I negative-cache 'not found' with a short TTL and front it with a Bloom filter for the known key set, plus input validation and rate limiting to kill abusive probing."</div>
`,

"redis-caching-problems__cache-avalanche-ttl-jitter": `
<p class="lead">Avalanche is when a large number of keys expire at (nearly) the same moment — or the cache restarts empty — so a flood of misses hits the database simultaneously and can take it down.</p>

<h2>Why it happens</h2>
<ul>
<li>Many keys were populated together (e.g. a warm-up or a batch job) with the <em>same</em> TTL, so they all expire on the same tick.</li>
<li>The cache node restarted / failed over and came back cold.</li>
</ul>

<h2>Fixes</h2>
<ul>
<li><strong>TTL jitter:</strong> add randomness to each TTL (<code>ttl + rand(0, spread)</code>) so expiries spread out instead of synchronising.</li>
<li><strong>Staggered warm-up:</strong> pre-load hot keys gradually, not all at once, and with jittered TTLs.</li>
<li><strong>Request coalescing + per-key rebuild lock:</strong> even if many keys expire, only one rebuild per key reaches the DB (see stampede).</li>
<li><strong>Protect the DB:</strong> a circuit breaker / bulkhead so a surge can't exhaust connections, plus serve stale-while-revalidate.</li>
</ul>
<pre><code>TimeSpan Jitter(TimeSpan baseTtl) =&gt;
    baseTtl + TimeSpan.FromSeconds(Random.Shared.Next(0, 60));</code></pre>

<div class="say"><strong>Say this:</strong> "Avalanche is mass simultaneous expiry — often same-TTL keys dying together or a cold restart. The core fix is TTL jitter so expiries spread out, plus staggered warm-up, per-key rebuild locks, and a circuit breaker so the DB can't be swamped."</div>

<p><em>Related:</em> avalanche (many keys) vs breakdown (one hot key) vs stampede (concurrent rebuild of one key) — same family, different scope.</p>
`,

"redis-caching-problems__cache-breakdown-a-single-hot-key-expires": `
<p class="lead">Breakdown (a.k.a. "hotspot invalid") is the single-key case of a stampede: one <em>very hot</em> key expires, and in the gap before it's rebuilt, a huge number of concurrent requests all miss and slam the database for that one value.</p>

<h2>Fixes</h2>
<ul>
<li><strong>Single-flight rebuild lock:</strong> only one request rebuilds the key (Redis <code>SET NX</code> across replicas, <code>SemaphoreSlim</code> within a process); others wait briefly or serve the previous value.</li>
<li><strong>Stale-while-revalidate:</strong> keep serving the old value past its logical expiry and refresh it in the background, so no request ever faces an empty hot key.</li>
<li><strong>Never expire hot keys; refresh them proactively:</strong> for a known hot key (homepage config, trending item), use a background refresher on a timer rather than TTL expiry, so there's no expiry gap at all.</li>
<li><strong>Logical expiry:</strong> store value + an "expiresAt" field; the value never TTL-deletes, and whoever notices it's logically stale triggers a background refresh while everyone keeps reading the current value.</li>
</ul>

<div class="warn"><strong>Breakdown vs avalanche:</strong> breakdown = <em>one</em> hot key expiring under heavy concurrency; avalanche = <em>many</em> keys expiring together. The hot-key fix is single-flight / never-expire; the avalanche fix is TTL jitter.</div>

<div class="say"><strong>Say this:</strong> "Breakdown is one hot key expiring and triggering a stampede for that single value. I either rebuild it single-flight, serve stale-while-revalidate, or don't TTL-expire hot keys at all and refresh them on a background timer — so there's never an empty-key gap to pile onto."</div>
`,

"redis-caching-problems__hot-keys-traffic-skew-to-one-key": `
<p class="lead">A hot key is one key receiving a hugely disproportionate share of traffic (a celebrity profile, a trending product, a global config). Even though Redis is fast, all that load lands on the single shard/node that owns the key, creating a bottleneck Cluster can't spread.</p>

<h2>Why it's a problem</h2>
<ul>
<li>In Cluster, a key lives on one slot → one primary. Sharding doesn't help because the hotness is on a single key, not spread across the keyspace.</li>
<li>That one node saturates CPU/network while others idle; latency for that key (and its neighbours) climbs.</li>
<li>If the hot key also expires, you get breakdown on top.</li>
</ul>

<h2>Fixes</h2>
<ul>
<li><strong>Local L1 cache:</strong> cache the hot value in-process (short TTL) so most reads never reach Redis at all. A tiny near-cache absorbs the skew.</li>
<li><strong>Read replicas:</strong> fan hot-key reads out across replicas to multiply read capacity.</li>
<li><strong>Key splitting / sharding the value:</strong> replicate the value under N suffixed keys (<code>config:hot:0..N</code>) on different slots and have clients read a random one — spreads load across nodes. Writes update all copies.</li>
<li><strong>Client-side request coalescing</strong> so bursts collapse into fewer backend reads.</li>
</ul>

<div class="say"><strong>Say this:</strong> "A hot key pins load to one node, so Cluster sharding doesn't help. I put a short-TTL in-process L1 in front of it so most reads never hit Redis, use read replicas to multiply read capacity, and for extreme cases split the value across N keys on different slots and read a random copy."</div>
`,

"redis-caching-problems__big-keys-huge-values-block-the-server": `
<p class="lead">A big key is a single value that's very large (a multi-megabyte string, or a collection with millions of elements). Because Redis is single-threaded, any O(N) operation on it — or deleting it — can block the whole server and spike latency for every other client.</p>

<h2>Why big keys hurt</h2>
<ul>
<li><strong>Blocking operations:</strong> <code>DEL</code> of a huge key, <code>HGETALL</code>/<code>SMEMBERS</code>/<code>LRANGE 0 -1</code> on a huge collection, or serialising a big value all run O(N) on the single thread, stalling everyone.</li>
<li><strong>Network &amp; memory spikes:</strong> transferring MBs per request; in Cluster a big key can't be split across slots, so it unbalances a node.</li>
<li><strong>Expiry/eviction of a big key</strong> can cause a latency spike.</li>
</ul>

<h2>Fixes</h2>
<ul>
<li><strong>Split big values:</strong> break a giant hash/list into many smaller keys, or store large blobs in object storage (S3/Blob) and cache only a reference/metadata in Redis.</li>
<li><strong>Avoid O(N) commands:</strong> read fields/ranges incrementally (<code>HSCAN</code>, <code>SSCAN</code>, <code>LRANGE</code> with paging) instead of fetching the whole thing.</li>
<li><strong>Use <code>UNLINK</code> instead of <code>DEL</code>:</strong> UNLINK reclaims memory asynchronously on a background thread, avoiding the blocking free.</li>
<li><strong>Detect them:</strong> <code>redis-cli --bigkeys</code>, <code>MEMORY USAGE key</code>, and slowlog.</li>
</ul>

<div class="say"><strong>Say this:</strong> "Big keys are dangerous on a single-threaded server — one O(N) op or a DEL on a multi-MB value stalls every client. I split large structures into smaller keys, keep big blobs in object storage with only a reference in Redis, page with HSCAN/SSCAN, delete with UNLINK, and hunt for them with --bigkeys."</div>
`,

"redis-caching-problems__cache-pollution-eviction-oom": `
<p class="lead">Cache pollution is when low-value, rarely-reused entries crowd out genuinely hot data — so the hit ratio falls even though the cache is "full". Related failure: hitting <code>maxmemory</code> and either evicting good data or rejecting writes (OOM).</p>

<h2>How pollution happens</h2>
<ul>
<li>A batch job, scan, or one-off report loads huge amounts of data that's never read again, evicting the hot working set (classic with plain LRU).</li>
<li>Caching everything indiscriminately (e.g. write-through on write-heavy data that's rarely re-read).</li>
</ul>

<h2>Fixes</h2>
<ul>
<li><strong>Use LFU, not LRU:</strong> <code>allkeys-lfu</code> keeps frequently-used keys and evicts the one-hit-wonders a scan brings in. LFU is pollution-resistant; LRU is not.</li>
<li><strong>Admission control:</strong> only cache on the second access (don't admit one-off reads), or use a probabilistic admission policy (TinyLFU-style) so a scan can't evict hot data.</li>
<li><strong>Cache selectively:</strong> don't cache data you won't re-read; separate "bulk/scan" access paths from cached ones.</li>
<li><strong>Short TTLs + size caps per category;</strong> per-tenant quotas so one tenant can't pollute shared memory.</li>
</ul>

<h2>Eviction / OOM</h2>
<p>When <code>maxmemory</code> is reached, the eviction policy decides: a pure cache should use <code>allkeys-lru/lfu</code>; a store that must not lose data uses <code>noeviction</code> (writes then fail with OOM — handle that as backpressure). Watch <code>evicted_keys</code> and memory fragmentation.</p>

<div class="say"><strong>Say this:</strong> "Pollution is low-value entries evicting hot ones — usually a scan or batch job under plain LRU. I switch to LFU (or TinyLFU-style admission so a scan can't evict the working set), cache selectively rather than everything, and set per-tenant quotas. On maxmemory, a cache evicts LRU/LFU while a source-of-truth store uses noeviction and treats OOM as backpressure."</div>
`,

"messaging-event-driven-systems__delivery-guarantees-at-least-at-most-exactly-once": `
<p class="lead">Delivery guarantees describe how many times a message can reach a consumer. The practical truth every senior engineer states up front: <strong>true exactly-once delivery is impossible over a network</strong> — you achieve at-least-once delivery plus idempotent processing, which together give exactly-once <em>effects</em>.</p>

<h2>The three guarantees</h2>
<table>
<tr><th>Guarantee</th><th>Lost?</th><th>Duplicated?</th><th>How</th><th>Use for</th></tr>
<tr><td>At-most-once</td><td>possible</td><td>never</td><td>ack/remove <em>before</em> processing (fire-and-forget)</td><td>lossy telemetry, metrics</td></tr>
<tr><td>At-least-once</td><td>never</td><td>possible</td><td>redeliver until the consumer acks success</td><td>the default for reliable systems</td></tr>
<tr><td>Exactly-once</td><td>never</td><td>never (in effect)</td><td>at-least-once delivery + dedup / idempotent write</td><td>payments, orders</td></tr>
</table>

<h2>Why exactly-once delivery is a myth</h2>
<p>After a consumer processes a message it must tell the broker "done" (ack). If it crashes <em>before</em> acking, the broker redelivers (duplicate). If it acks <em>before</em> processing, a crash loses the message. There is no atomic "process and ack" across the network — this is the two-generals / FLP result. So you cannot prevent duplicates at the <em>delivery</em> layer.</p>
<p>What you <em>can</em> do is make the <em>effect</em> happen once: at-least-once delivery + an idempotent consumer (a dedup key or a naturally idempotent write). Kafka's "exactly-once semantics" is transactions <em>within Kafka</em> (idempotent producer + transactional offsets), not end-to-end into your database — you still need idempotency at the edge where you touch external state.</p>

<div class="say"><strong>Say this:</strong> "Exactly-once delivery is a myth across a network — ack-before-process loses messages, process-before-ack duplicates them. So I design for at-least-once delivery and make the consumer idempotent, which gives exactly-once <em>effects</em>. In practice that's the outbox on the producer side and a dedup key (inbox) on the consumer side."</div>

<h2>Follow-ups</h2>
<ul><li>How does Kafka's EOS actually work, and why isn't it end-to-end?</li><li>Why can't you atomically process-and-ack?</li></ul>
`,

"messaging-event-driven-systems__idempotency-duplicate-detection": `
<p class="lead">An operation is <strong>idempotent</strong> if applying it twice has the same effect as applying it once. Because reliable messaging is at-least-once, duplicates <em>will</em> happen — idempotency is how you turn at-least-once delivery into exactly-once effects. This is the single most important messaging skill.</p>

<h2>Two ways to be idempotent</h2>
<ul>
<li><strong>Naturally idempotent writes.</strong> Design the operation so re-applying is a no-op: an <code>UPSERT</code>, "set status = Shipped" (not "increment"), a conditional update guarded by a version/rowversion. Re-running changes nothing.</li>
<li><strong>Dedup via an idempotency key.</strong> The producer stamps each message with a unique id; the consumer records processed ids and skips any it has seen. Crucially, record "processed" <em>in the same transaction</em> as the effect (that is the inbox pattern) — otherwise you can process, crash before recording, and process again.</li>
</ul>
<pre><code>// idempotent handler with a dedup table (one transaction)
using var tx = db.BeginTransaction();
if (await db.ProcessedMessages.AnyAsync(m =&gt; m.Id == msg.MessageId))
    { await Complete(msg); return; }              // already handled -&gt; skip

await ApplyBusinessChange(msg);                    // the effect
db.ProcessedMessages.Add(new(msg.MessageId));      // record dedup
await tx.CommitAsync();                             // both or neither</code></pre>

<div class="warn"><strong>The dangerous non-idempotent operations:</strong> "charge the card", "increment balance", "send email", "POST to a partner API". A timeout never tells you whether the server already applied the change, so a blind retry double-applies. These <em>must</em> carry a dedup/idempotency key the receiver honours.</div>

<p>Azure Service Bus offers built-in <strong>duplicate detection</strong> (<code>RequiresDuplicateDetection</code>): it drops messages with a repeated <code>MessageId</code> within a configured window — handy, but it only covers producer resends inside that window, not consumer-side reprocessing, so you still want an inbox for the effect.</p>

<div class="say"><strong>Say this:</strong> "At-least-once means duplicates are guaranteed, so every handler is idempotent — either a naturally idempotent write like an upsert or set-status, or a dedup key that I check and record in the same transaction as the side effect. For external calls like charging a card, the idempotency key goes to the provider so a retry can't double-charge."</div>
`,

"messaging-event-driven-systems__inbox-pattern-consumer-side-dedup": `
<p class="lead">The inbox pattern is consumer-side deduplication done transactionally. You record each processed message's id in an "inbox" table <em>in the same database transaction</em> as the work, and skip any id already present — turning at-least-once delivery into exactly-once processing.</p>

<h2>How it works</h2>
<pre><code>using var tx = db.BeginTransaction();
bool seen = await db.Inbox.AnyAsync(x =&gt; x.MessageId == msg.MessageId);
if (seen) { await Complete(msg); return; }      // duplicate -&gt; ignore

await Handle(msg);                                // the business effect
db.Inbox.Add(new InboxEntry(msg.MessageId, DateTime.UtcNow));
await tx.CommitAsync();                            // effect + dedup commit atomically
await Complete(msg);                              // ack the broker last</code></pre>
<p>Because the effect and the dedup record commit in <strong>one local transaction</strong>, a crash either commits both or neither. If the broker redelivers (because the ack was lost), the next attempt finds the id in the inbox and safely skips.</p>

<h2>Trade-offs</h2>
<ul>
<li>Requires a transactional store shared with your business data (the inbox lives in your DB).</li>
<li>The inbox table grows — prune entries older than your maximum redelivery window.</li>
<li>Ordering of the ack: complete the broker message <em>after</em> commit. If Complete fails, you get a redelivery that the inbox deduplicates — safe.</li>
</ul>

<div class="say"><strong>Say this:</strong> "The inbox is consumer-side dedup: I insert the message id and do the work in one transaction, so a redelivery after a crash is detected and skipped. Paired with the outbox on the producer side, that's the standard recipe for reliable exactly-once effects without distributed transactions."</div>
`,

"messaging-event-driven-systems__outbox-pattern-reliable-publish-after-a-db-write": `
<p class="lead">The outbox pattern reliably publishes a message <em>after</em> a database write <strong>without a distributed transaction</strong>. You write the business change and an "outbox" row in the same local DB transaction; a separate relay reads the outbox and publishes to the broker.</p>

<h2>The problem it solves: the dual-write</h2>
<p>You cannot atomically commit to your database <em>and</em> a message broker — they're two systems with no shared transaction. Publish-then-commit can leave a phantom event if the DB rolls back; commit-then-publish can lose the event if you crash in between. The outbox makes the <strong>database the single commit point</strong>.</p>

<h2>How it works</h2>
<pre><code>// 1) one local transaction: business data + the event row
using var tx = db.BeginTransaction();
db.Orders.Add(order);
db.Outbox.Add(new OutboxMessage("OrderPlaced", Serialize(evt)));
await tx.CommitAsync();                 // atomic: order AND event committed together

// 2) a separate relay publishes committed outbox rows, then marks them sent
foreach (var m in await db.Outbox.Where(x =&gt; !x.Sent).ToListAsync()) {
    await broker.PublishAsync(m);
    m.Sent = true; await db.SaveChangesAsync();
}</code></pre>
<p>The relay polls the table (or uses <strong>Change Data Capture</strong> like Debezium reading the transaction log — lower latency, no polling). The relay is itself <strong>at-least-once</strong>: if it crashes after publishing but before marking the row sent, it republishes — so consumers must be idempotent (the inbox).</p>

<h2>Trade-offs</h2>
<ul><li>Adds latency and a moving part (the relay); CDC vs polling is a tuning choice.</li><li>Preserve ordering by relaying in insertion order (and per aggregate if needed).</li><li>Outbox (producer) + inbox (consumer) together give exactly-once effects.</li></ul>

<div class="say"><strong>Say this:</strong> "Outbox solves the dual-write: I commit the event to an outbox table in the same transaction as the business data, and a relay publishes it afterward. The relay is at-least-once, so consumers dedup via the inbox. The database is the one source of truth — no two-phase commit needed."</div>
`,

"messaging-event-driven-systems__ack-redelivery-visibility-timeout-peek-lock": `
<p class="lead">This is the broker mechanism that makes at-least-once delivery work: the broker does not remove a message until the consumer <strong>acknowledges</strong> success. Until then the message is hidden from other consumers (a lock / visibility timeout); if the consumer crashes or the lock expires, the message is redelivered.</p>

<h2>Azure Service Bus: peek-lock</h2>
<ul>
<li><strong>Receive (peek-lock):</strong> the message is locked and invisible to other receivers for the <em>lock duration</em>.</li>
<li><strong>Complete:</strong> processing succeeded → remove the message.</li>
<li><strong>Abandon:</strong> release the lock immediately → redelivered at once (increments delivery count).</li>
<li><strong>DeadLetter:</strong> move it to the dead-letter sub-queue (poison / unprocessable).</li>
<li><strong>Defer:</strong> set aside for later retrieval by sequence number.</li>
</ul>
<p>SQS is the same idea with a <em>visibility timeout</em>; you delete the message on success. <code>ReceiveAndDelete</code> mode removes on receive → that's <strong>at-most-once</strong> (faster, lossy). <code>PeekLock</code> is at-least-once.</p>

<div class="warn"><strong>The lock-expiry trap:</strong> if processing runs longer than the lock duration, the lock expires, the message becomes visible, and a <em>second</em> consumer picks it up — now it's processed twice. Fix it by renewing the lock (<code>RenewMessageLockAsync</code> / change-visibility) for long work, or keeping handlers short — and always making them idempotent as a backstop.</div>

<div class="say"><strong>Say this:</strong> "Peek-lock is how a broker delivers at-least-once: the message is locked and invisible until I Complete it; a crash or lock expiry triggers redelivery. The classic bug is work outrunning the lock duration, which causes concurrent reprocessing — I renew the lock for long handlers and keep the work idempotent."</div>
`,

"messaging-event-driven-systems__retries-backoff-dead-letter-queues-dlq": `
<p class="lead">When a handler fails, the broker redelivers. The design goal: let <em>transient</em> failures retry with backoff, and send <em>permanently</em>-bad messages to a dead-letter queue (DLQ) so a single poison message doesn't retry forever and block the queue.</p>

<h2>Classify the failure</h2>
<ul>
<li><strong>Transient</strong> (timeout, 503, deadlock victim, throttling): retry with <strong>exponential backoff + jitter</strong> so a wave of failures doesn't become a retry storm.</li>
<li><strong>Permanent</strong> (validation error, malformed payload, business rule violation): do <em>not</em> retry — dead-letter immediately. Retrying can never succeed and just burns resources.</li>
</ul>

<h2>Retry styles</h2>
<table>
<tr><th>Style</th><th>How</th><th>Watch out</th></tr>
<tr><td>Immediate / in-process</td><td>catch + retry a few times in the handler</td><td>blocks the consumer during the backoff</td></tr>
<tr><td>Scheduled redelivery</td><td>Abandon → broker redelivers</td><td>fast loop; use with a delay</td></tr>
<tr><td>Delayed re-enqueue</td><td>re-send with <code>ScheduledEnqueueTimeUtc</code></td><td>extra message; preserves throughput</td></tr>
</table>

<h2>Dead-letter queue</h2>
<p>Service Bus auto-dead-letters a message after <code>MaxDeliveryCount</code> attempts (also on expiry or explicit DeadLetter). The DLQ is a separate sub-queue you <strong>monitor, inspect, fix, and replay</strong>. Without a DLQ a poison message redelivers endlessly, blocking progress and burning CPU.</p>

<div class="say"><strong>Say this:</strong> "I split failures into transient — retry with exponential backoff and jitter — and permanent — dead-letter immediately. Service Bus dead-letters after MaxDeliveryCount, and I monitor the DLQ so I can inspect and replay. For long backoffs I use delayed re-enqueue rather than holding the consumer. A DLQ is what stops one poison message from blocking the whole queue."</div>
`,

"messaging-event-driven-systems__ordering-partitioning-sessions": `
<p class="lead">Global ordering across a scaled-out queue is expensive and usually unnecessary. What you actually want is ordering <em>within a key</em> — Service Bus <strong>sessions</strong> and Kafka <strong>partitions</strong> both give per-key FIFO while parallelising across keys.</p>

<h2>Order within a key, parallelise across keys</h2>
<p>Choose an ordering key — typically the aggregate id (per order, per customer, per device). All messages with the same key go to the same partition/session and are processed strictly in order by a single consumer; different keys are handled concurrently by other consumers.</p>
<ul>
<li><strong>Service Bus sessions:</strong> set <code>SessionId</code>; a session is locked to one consumer and delivered FIFO. Great for "all events for order 42 in order".</li>
<li><strong>Kafka:</strong> the record key hashes to a partition; one consumer per partition within a group; ordering is guaranteed <em>within a partition</em> only.</li>
</ul>

<h2>The trade-offs</h2>
<ul>
<li>Ordering caps parallelism: one consumer per key-group. A <strong>hot key</strong> becomes a hot partition/session and a throughput bottleneck.</li>
<li>At-least-once + retries can <em>reorder</em> unless the handler accounts for it (e.g., a failed message retried while the next is processed).</li>
<li><strong>Best move:</strong> design operations to be commutative/idempotent so strict ordering isn't required — then you can scale freely. Use ordering only where the domain truly needs it.</li>
</ul>

<div class="say"><strong>Say this:</strong> "You can't cheaply order a scaled queue globally — you order within a key. I pick an ordering key like the aggregate id, use Service Bus sessions or Kafka partitions for per-key FIFO, and parallelise across keys. Where I can, I make operations commutative or idempotent so I don't need strict ordering at all and can scale out."</div>
`,

"messaging-event-driven-systems__concurrent-handlers-transactions": `
<p class="lead">To scale throughput you run many handler instances pulling from one queue — the <strong>competing consumers</strong> pattern. That introduces concurrency (parallel messages can touch the same entity) and a transactional question (how to combine "process message + DB write + publish" safely).</p>

<h2>Competing consumers</h2>
<p>Multiple consumers read the same queue; the broker delivers each message to exactly one of them. This scales horizontally and is self-balancing — slow consumers simply take fewer messages. But two messages about the <em>same</em> entity can run at the same time.</p>
<ul>
<li><strong>Serialize per entity</strong> with ordering/sessions (one consumer per key), or</li>
<li><strong>Allow concurrency + optimistic concurrency</strong> (rowversion): the second committer detects the conflict and retries.</li>
</ul>

<h2>Transaction scope — don't span DB and broker</h2>
<p>The handler's DB work, the inbox dedup insert, and any outbox enqueue should be <strong>one local database transaction</strong>. Do <em>not</em> try to enlist the broker and the DB in one distributed transaction (2PC) — it's slow and fragile. Instead:</p>
<pre><code>using var tx = db.BeginTransaction();
// dedup (inbox) + business change + outbox for follow-up events
...
await tx.CommitAsync();        // local, atomic
await Complete(msg);           // ack the broker AFTER commit</code></pre>
<p>If <code>Complete</code> fails after the commit, the message redelivers and the inbox dedups it — safe. Tune <code>MaxConcurrentCalls</code> and <code>PrefetchCount</code> to balance throughput against downstream load.</p>

<div class="say"><strong>Say this:</strong> "I scale with competing consumers, which means parallel messages can hit the same aggregate — I guard that with per-key sessions or optimistic concurrency. The handler does its DB write, inbox dedup and outbox enqueue in one local transaction, then completes the broker message after commit; a redelivery is safely deduped. I never span the DB and broker in a distributed transaction."</div>
`,

"messaging-event-driven-systems__external-side-effects-the-dual-write-hazard": `
<p class="lead">The central reliability problem in event-driven systems: a unit of work must update your database <em>and</em> cause an external effect (publish an event, call a partner API, send an email). These are two systems with no shared transaction — if one succeeds and the other doesn't, your state diverges.</p>

<h2>Where it bites</h2>
<ul>
<li>Save order <em>and</em> publish <code>OrderPlaced</code>.</li>
<li>Charge the card <em>and</em> mark the order paid.</li>
<li>Update the DB <em>and</em> send a confirmation email.</li>
</ul>
<p>Two failure windows: commit the DB then crash before the external effect (lost event / unsent email), or do the external effect then roll back the DB (phantom event / charged-but-no-order).</p>

<h2>Fixes</h2>
<ul>
<li><strong>For publishing events → outbox.</strong> Write the event in the same transaction as the DB change; a relay publishes it. The DB becomes the single commit point.</li>
<li><strong>For non-transactional calls (email, charge, partner API) → drive them from a durable record</strong> (outbox row / saga step) and make them <strong>idempotent with a dedup key</strong>, so the inevitable retries don't double-send or double-charge.</li>
<li><strong>For multi-step flows across services → a saga</strong> with compensating actions (undo a step if a later one fails), since you can't lock resources across services.</li>
</ul>

<div class="say"><strong>Say this:</strong> "The dual-write hazard is updating my DB and doing an external effect with no shared transaction. I make the database the single commit point via the outbox, then drive external calls from that durable record with idempotency keys so retries can't double-charge or double-send. For multi-service workflows I use a saga with compensations rather than a distributed transaction."</div>
`,

"messaging-event-driven-systems__azure-service-bus-vs-redis-streams": `
<p class="lead">Both move messages, but they sit at different reliability tiers. Azure Service Bus is a full enterprise broker; Redis Streams is a lightweight durable log you reach for when you already run Redis and can tolerate weaker guarantees.</p>

<h2>Azure Service Bus</h2>
<ul>
<li>Queues and <strong>topics/subscriptions</strong> (pub/sub with SQL/correlation filters).</li>
<li><strong>Peek-lock</strong> with at-least-once, built-in <strong>DLQ</strong>, <strong>sessions</strong> (FIFO per key), <strong>duplicate detection</strong>, <strong>scheduled/deferred</strong> messages, transactions, auto-forward.</li>
<li>Durable and managed — the enterprise default for reliable messaging on Azure.</li>
</ul>

<h2>Redis Streams</h2>
<ul>
<li>Append-only log with ids, <strong>consumer groups</strong>, <code>XACK</code>, a pending-entries list for recovery, replay from any id.</li>
<li>At-least-once, but durability depends on AOF/replication; <strong>no built-in DLQ or rich routing</strong>; memory-bound; you build retry/dead-letter yourself.</li>
</ul>

<table>
<tr><th></th><th>Service Bus</th><th>Redis Streams</th></tr>
<tr><td>Durability</td><td>strong, managed</td><td>depends on config; memory-bound</td></tr>
<tr><td>DLQ / retry</td><td>built-in</td><td>DIY</td></tr>
<tr><td>Routing / filters</td><td>topics + subscriptions</td><td>minimal</td></tr>
<tr><td>Ordering</td><td>sessions</td><td>per-stream</td></tr>
<tr><td>When</td><td>mission-critical messaging</td><td>already have Redis; lightweight queue</td></tr>
</table>

<div class="say"><strong>Say this:</strong> "Service Bus is the right tool for durable, mission-critical messaging — DLQ, sessions, duplicate detection, topics with filters. Redis Streams is a fine lightweight queue when I already have Redis and can tolerate weaker durability, but I wouldn't make it my system-of-record broker."</div>
`,

"messaging-event-driven-systems__backpressure-poison-messages": `
<p class="lead">Two production hazards of any queue. <strong>Backpressure:</strong> consumers can't keep up with producers, so the queue grows without bound. <strong>Poison message:</strong> a message that always fails and, if retried forever, blocks progress and burns resources.</p>

<h2>Backpressure</h2>
<p>A queue absorbing a burst is a <em>feature</em> — load leveling. The problem is a <em>sustained</em> imbalance. Options:</p>
<ul>
<li><strong>Scale consumers</strong> — competing consumers, autoscaled on <em>queue depth</em> / age of the oldest message (e.g., KEDA on Service Bus length).</li>
<li><strong>Flow control</strong> — bound <code>PrefetchCount</code> and <code>MaxConcurrentCalls</code> so a consumer doesn't pull more than it can handle or overwhelm a downstream DB.</li>
<li><strong>Shed load</strong> — if producers outrun any feasible consumer capacity, reject/throttle at ingress rather than letting the queue (and latency) grow unbounded.</li>
<li><strong>Monitor</strong> queue depth and oldest-message age; alert before the backlog becomes hours.</li>
</ul>

<h2>Poison messages</h2>
<ul>
<li>Detect via the <strong>delivery count</strong>; after <code>MaxDeliveryCount</code>, <strong>dead-letter</strong> instead of retrying forever.</li>
<li>Guard the consumer loop so one bad message can't crash it — catch, dead-letter (or abandon), log with the message id, and continue.</li>
<li>Inspect the DLQ, fix the cause (bad data / bug), and replay.</li>
</ul>

<div class="say"><strong>Say this:</strong> "Backpressure is consumers falling behind producers — I let the queue absorb bursts, autoscale consumers on queue depth, and bound prefetch/concurrency; sustained overload means scaling or shedding at ingress. A poison message is one that always fails — delivery-count-based dead-lettering stops the infinite retry that would otherwise block the queue and burn CPU, and I monitor and replay the DLQ."</div>
`,

"infrastructure-as-code__what-iac-is-why-it-matters": `
<p class="lead">Infrastructure as Code means defining your infrastructure — networks, VMs, databases, DNS, identity, load balancers — in version-controlled, declarative files and provisioning it by running a tool, instead of clicking in a portal. The infrastructure becomes reproducible, reviewable, auditable code.</p>

<h2>Why it matters</h2>
<ul>
<li><strong>Reproducibility:</strong> stand up identical dev/staging/prod, and rebuild an environment from scratch after a disaster.</li>
<li><strong>Version control:</strong> every change is a diff with history, blame, PR review, and git-based rollback.</li>
<li><strong>No configuration drift / no snowflake servers:</strong> the defined state is enforced, so environments don't quietly diverge.</li>
<li><strong>Speed &amp; safety:</strong> automation removes manual, error-prone portal clicking and enables self-service.</li>
<li><strong>Documentation:</strong> the code <em>is</em> the source of truth for what exists and why.</li>
</ul>

<h2>Declarative vs imperative</h2>
<p>Declarative tools (Terraform, Bicep, CloudFormation, Pulumi) let you describe the <em>desired end state</em>; the tool figures out the diff and the order of operations, and the result is idempotent — re-running with no change does nothing. Imperative scripts list the <em>steps</em> ("create this, then that"), which are harder to make idempotent and repeatable. Prefer declarative.</p>

<div class="say"><strong>Say this:</strong> "IaC is defining infrastructure as version-controlled declarative code so it's reproducible, reviewable and auditable. The real win is killing portal drift and snowflake servers — the git repo is the source of truth, every change is a reviewed PR, and I can rebuild an environment from nothing. I favour declarative tools because they're idempotent: I describe the end state and the tool computes the diff."</div>
`,

"infrastructure-as-code__terraform-fundamentals-providers-resources-plan-apply": `
<p class="lead">Terraform is a declarative, cloud-agnostic IaC tool. You declare resources in HCL; Terraform builds a dependency graph, compares your config to reality (via state), and applies the difference. The core loop is write → init → plan → apply.</p>

<h2>Building blocks</h2>
<ul>
<li><strong>Providers:</strong> plugins that talk to a platform (azurerm, aws, kubernetes). You pin their versions.</li>
<li><strong>Resources:</strong> the things you manage (a resource group, a VM, a database).</li>
<li><strong>Data sources:</strong> read existing, externally-managed things to reference.</li>
<li><strong>Variables / outputs:</strong> parameterize inputs and expose results.</li>
<li><strong>State:</strong> Terraform's record of what it manages (see the state topic).</li>
</ul>

<h2>The workflow</h2>
<table>
<tr><td><code>terraform init</code></td><td>download providers, configure the backend</td></tr>
<tr><td><code>terraform plan</code></td><td>compute and show the diff — what will be created / changed / destroyed</td></tr>
<tr><td><code>terraform apply</code></td><td>make reality match the config</td></tr>
<tr><td><code>terraform destroy</code></td><td>tear the managed resources down</td></tr>
</table>
<pre><code>terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~&gt; 3.0" }
  }
}
provider "azurerm" { features {} }

resource "azurerm_resource_group" "main" {
  name     = var.rg_name
  location = "westeurope"
}</code></pre>
<p>It's <strong>idempotent</strong> (re-applying an unchanged config is a no-op) and <strong>declarative</strong> (you describe the end state, not the steps).</p>

<div class="say"><strong>Say this:</strong> "Terraform is declarative and cloud-agnostic — I declare resources in HCL and the plan/apply loop computes the diff before changing anything. Plan is the safety gate: nothing happens until I've reviewed exactly what will be created, changed, or destroyed, and because it's idempotent, re-applying an unchanged config does nothing."</div>
`,

"infrastructure-as-code__state-locking-remote-backend": `
<p class="lead">Terraform records what it manages in a <strong>state file</strong> that maps each config address to a real cloud resource id. State is the basis for computing the diff. On a team it must live in a <strong>remote backend with locking</strong> — otherwise concurrent applies corrupt it. This is the single most important Terraform operational topic.</p>

<h2>Why state exists</h2>
<p>Terraform needs to know which real resource corresponds to <code>azurerm_resource_group.main</code>. State stores that mapping plus metadata and dependency info, and lets <code>plan</code> diff config against reality efficiently.</p>

<h2>Why local state is dangerous on a team</h2>
<ul>
<li><strong>No sharing:</strong> it's on one laptop; teammates can't collaborate, and losing it is a disaster.</li>
<li><strong>No locking:</strong> two people running <code>apply</code> at once corrupt the state or make conflicting changes.</li>
<li><strong>Secrets in plaintext:</strong> state can contain generated passwords/keys unencrypted.</li>
</ul>

<h2>Remote backend</h2>
<p>Store state in <strong>Azure Storage</strong> (blob), <strong>S3 + DynamoDB</strong>, or Terraform Cloud. This gives:</p>
<ul>
<li><strong>Shared state</strong> for the whole team.</li>
<li><strong>State locking:</strong> a blob lease / DynamoDB lock ensures only one apply runs at a time — no concurrent corruption.</li>
<li><strong>Durability, versioning, encryption at rest.</strong></li>
</ul>
<p>Useful state commands: <code>state list</code>, <code>state show</code>, <code>state mv</code> (rename/move without destroy+create), <code>state rm</code> (stop managing), <code>import</code>.</p>

<div class="warn"><strong>Never</strong> commit the state file to git — it holds secrets in plaintext. Encrypt the backend and restrict access.</div>

<div class="say"><strong>Say this:</strong> "State maps my config to real resource ids and is the basis for the diff. On a team it must be in a remote backend — Azure Storage or S3 — with locking so two applies can't corrupt it. State holds secrets in plaintext, so it's encrypted, access-controlled, and never in git. Local state on a laptop is a team outage waiting to happen."</div>
`,

"infrastructure-as-code__modules-reuse": `
<p class="lead">A module is a reusable, parameterized package of Terraform resources — the unit of abstraction and DRY. You define a module once (inputs → resources → outputs) and instantiate it many times with different variables.</p>

<h2>How it works</h2>
<p>The root module calls child modules. Inputs are variables, outputs expose values for callers. Source a module from a local path, a git URL, or a registry — and <strong>pin its version</strong>.</p>
<pre><code>module "network" {
  source = "./modules/network"   # or git::... or a registry ref, with version
  cidr   = "10.0.0.0/16"
  env    = var.env
}

# consume a module output elsewhere
subnet_id = module.network.subnet_id</code></pre>

<h2>Why modules</h2>
<ul>
<li><strong>DRY &amp; consistency:</strong> one blessed "web app + database + networking" module used everywhere, so environments match.</li>
<li><strong>Encapsulation:</strong> hide complexity behind a small input surface.</li>
<li><strong>Governance:</strong> a shared internal registry of "golden" modules with sane, secure defaults.</li>
</ul>

<div class="warn"><strong>Pitfalls:</strong> over-abstracting too early (a module with 40 variables is worse than copy-paste); and <strong>version your modules</strong> — pin versions so a module change doesn't silently roll out to every consumer at once.</div>

<div class="say"><strong>Say this:</strong> "A module is a parameterized, versioned building block — inputs, resources, outputs. I factor common infrastructure into modules with secure defaults and reuse them across teams and environments for consistency. I pin module versions so a change rolls out deliberately, and I avoid over-abstracting before the pattern has actually repeated."</div>
`,

"infrastructure-as-code__environments-workspaces-vs-directories": `
<p class="lead">Each environment (dev / staging / prod) needs <strong>isolated state</strong> so a dev apply can never touch prod. Two approaches: Terraform <em>workspaces</em> (one config, multiple state slots) or a <em>directory/config per environment</em> (the safer choice at scale).</p>

<h2>Workspaces</h2>
<pre><code>terraform workspace new prod
terraform workspace select prod   # same code, separate state per workspace</code></pre>
<ul>
<li><strong>Pros:</strong> DRY, quick to set up, identical code across envs.</li>
<li><strong>Cons:</strong> a foot-gun — easy to apply to the wrong workspace thinking you're in dev; every env must share identical code, so you can't let prod diverge safely; the active workspace is easy to lose track of.</li>
</ul>

<h2>Directory per environment</h2>
<p><code>environments/dev</code>, <code>environments/prod</code>, each with its own backend/state and <code>.tfvars</code>, all sharing the same modules.</p>
<ul>
<li><strong>Pros:</strong> explicit, strong isolation, clear blast radius, and prod can differ from dev deliberately.</li>
<li><strong>Cons:</strong> some duplication — mitigated by shared modules (and tools like Terragrunt).</li>
</ul>

<div class="say"><strong>Say this:</strong> "Each environment needs isolated state. Workspaces are quick but a foot-gun — it's too easy to apply to prod thinking you're in dev, and all envs share identical code. At scale I prefer a directory per environment: separate backend and tfvars, sharing modules. It's explicit, isolates blast radius, and lets prod differ from dev safely."</div>
`,

"infrastructure-as-code__drift-detection": `
<p class="lead">Drift is when the real infrastructure no longer matches your Terraform config — someone changed it in the portal, an autoscaler or another tool modified it, or there was a manual hotfix. <code>terraform plan</code> detects drift by refreshing state against reality and showing the difference.</p>

<h2>How it's detected</h2>
<p><code>plan</code> refreshes state by reading the actual resource attributes from the cloud, compares them to your config and state, and reports what differs. A <strong>non-empty plan on a config you didn't change</strong> is drift.</p>

<h2>Common causes</h2>
<ul>
<li>Manual portal/CLI changes ("I'll just tweak it quickly").</li>
<li>Out-of-band automation or another tool editing the same resource.</li>
<li>Provider or cloud default values changing under you.</li>
</ul>

<h2>How to handle it</h2>
<ul>
<li><strong>Revert:</strong> re-apply to bring reality back to the config.</li>
<li><strong>Codify:</strong> if the manual change was intentional and correct, update the config to match, then apply.</li>
<li><strong>Prevent:</strong> restrict out-of-band write access so humans can't bypass IaC, and run <strong>scheduled drift detection</strong> (a nightly <code>plan</code> in CI, or Terraform Cloud's drift detection) that alerts on a non-empty plan.</li>
</ul>

<div class="say"><strong>Say this:</strong> "Drift is reality diverging from my config, usually a manual portal change. terraform plan surfaces it by refreshing against the live resources. I either re-apply to revert it or codify the change if it was intended. The real fix is prevention: lock down out-of-band write access and run scheduled drift detection in CI so I catch it before it causes an incident."</div>
`,

"infrastructure-as-code__import-migration-of-existing-resources": `
<p class="lead">When resources already exist — created manually or by another tool — Terraform doesn't manage them until you <strong>import</strong> them into state. Import binds an existing cloud resource to a config address without recreating it, so you can bring brownfield infrastructure under IaC safely.</p>

<h2>Importing</h2>
<ol>
<li>Write the matching <code>resource</code> block in your config.</li>
<li>Import the real resource into state:
<pre><code># classic CLI
terraform import azurerm_resource_group.main /subscriptions/.../resourceGroups/main

# Terraform 1.5+ : a declarative, plan-reviewable import block
import {
  to = azurerm_resource_group.main
  id = "/subscriptions/.../resourceGroups/main"
}</code></pre></li>
<li>Run <code>plan</code> and iterate on the config until it shows <strong>no changes</strong> — meaning your code now matches reality.</li>
</ol>

<h2>Refactoring without downtime: moved blocks</h2>
<p>To rename a resource or move it into a module <em>without</em> destroy-and-recreate, use a <code>moved</code> block (or the older <code>terraform state mv</code>). Terraform updates the state address instead of recreating the resource — essential for stateful things like databases.</p>
<pre><code>moved {
  from = azurerm_resource_group.old
  to   = azurerm_resource_group.main
}</code></pre>

<div class="warn"><strong>Brownfield rule:</strong> never let the first apply destroy and recreate a production resource. Import module by module and verify a zero-diff plan before applying.</div>

<div class="say"><strong>Say this:</strong> "To bring existing infra under Terraform I import it — write the resource block, import the real id into state, then iterate until plan shows no changes. The modern import block makes that reviewable in a PR. For refactors like renaming or moving a resource into a module, I use moved blocks so Terraform updates the state address instead of destroying and recreating a stateful resource."</div>
`,

"infrastructure-as-code__arm-bicep-azure-native-iac": `
<p class="lead">ARM (Azure Resource Manager) templates are Azure's native JSON IaC; <strong>Bicep</strong> is a cleaner domain-specific language that transpiles to ARM. Both are Azure-only and declarative, and they deploy through ARM directly — there's <strong>no separate state file</strong>, because Azure's resource graph is the state.</p>

<h2>ARM vs Bicep</h2>
<ul>
<li><strong>ARM templates:</strong> verbose, repetitive JSON — hard to author and review.</li>
<li><strong>Bicep:</strong> concise, typed, supports modules and great tooling; you author Bicep and it compiles to ARM. Microsoft's recommended Azure-native path.</li>
</ul>
<pre><code>param location string = resourceGroup().location
resource sa 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'mystorage123'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
}</code></pre>

<h2>Key differences vs Terraform</h2>
<ul>
<li><strong>No state file:</strong> Azure tracks the live state; deployments are incremental against the resource group.</li>
<li><strong>what-if:</strong> previews changes before deploy, like <code>terraform plan</code>.</li>
<li><strong>Deployment modes:</strong> <em>incremental</em> (default — add/update) vs <em>complete</em> (deletes anything not in the template — dangerous in prod).</li>
<li><strong>Day-0 support:</strong> new Azure features are available immediately (first-party), whereas Terraform providers can lag.</li>
</ul>

<div class="say"><strong>Say this:</strong> "Bicep is Azure's clean DSL that compiles to ARM — declarative, Azure-only, deployed through ARM so there's no state file to manage, and what-if previews the change like a plan. I'd pick Bicep for Azure-only shops that want first-party, day-0 service support, and Terraform when I need multi-cloud or one consistent workflow across providers. In prod I avoid complete deployment mode because it deletes anything not in the template."</div>
`,

"infrastructure-as-code__pulumi-cloudformation-ansible-the-differences": `
<p class="lead">Beyond Terraform there are other IaC tools. Two axes sort them: (a) a <strong>real programming language vs a DSL</strong>, and (b) <strong>provisioning</strong> (create cloud infrastructure) vs <strong>configuration management</strong> (configure existing machines).</p>

<h2>The players</h2>
<ul>
<li><strong>Pulumi:</strong> IaC written in real languages — C#, TypeScript, Python, Go. Declarative under the hood (desired state, diff/apply, a state file like Terraform) but you get loops, functions, types, and real abstractions. Great for complex logic and for .NET teams who want C#.</li>
<li><strong>CloudFormation:</strong> AWS-native declarative JSON/YAML — the AWS analogue of ARM/Bicep. AWS manages state as "stacks"; change sets preview changes; drift detection is built in. AWS-only.</li>
<li><strong>Ansible:</strong> primarily <em>configuration management</em> — agentless YAML playbooks run over SSH to configure servers (install packages, deploy apps, edit config). Push-based and procedural-ish; it can provision too, but that's not its sweet spot.</li>
</ul>

<h2>Provisioning vs configuration management</h2>
<p>Terraform / Pulumi / CloudFormation / ARM-Bicep <strong>provision</strong> cloud resources from declarative desired state. Ansible / Chef / Puppet <strong>configure</strong> the OS and apps on machines. The common pattern: Terraform provisions the infrastructure, then Ansible (or cloud-init, or containers) configures it — or you bake immutable images with Packer and skip in-place configuration entirely.</p>

<div class="say"><strong>Say this:</strong> "The axes are language-vs-DSL and provisioning-vs-config-management. Pulumi is Terraform-style desired state but written in C# or TypeScript — great for complex logic. CloudFormation is AWS's native stacks, ARM/Bicep is Azure's. Ansible is configuration management — agentless playbooks that configure existing servers. Typically Terraform provisions and Ansible or immutable images configure."</div>
`,

"infrastructure-as-code__ci-cd-secrets-rollback-for-iac": `
<p class="lead">IaC should flow through a pipeline, not someone's laptop. The standard shape: <strong>plan on the PR</strong> (reviewed), <strong>apply on merge</strong> (state locked), secrets injected securely, and a deliberate rollback story.</p>

<h2>The pipeline</h2>
<ul>
<li><strong>On PR:</strong> <code>fmt</code> + <code>validate</code> + a linter (tflint) + a security scan (checkov / tfsec) + <code>terraform plan</code>, with the plan posted to the PR for review. Nothing changes yet.</li>
<li><strong>On merge:</strong> <code>terraform apply</code>, usually behind a <strong>manual approval gate for prod</strong>. The remote backend's lock guarantees one apply at a time.</li>
<li><strong>Promotion:</strong> dev → staging → prod, same modules, per-env tfvars.</li>
</ul>

<h2>Secrets</h2>
<ul>
<li>Never hardcode or commit secrets; <strong>never commit state</strong> (it holds secrets in plaintext).</li>
<li>Inject via the pipeline's secret store (GitHub Actions secrets, Azure DevOps library, Key Vault) or — better — <strong>OIDC federated identity</strong> to the cloud, so there are no long-lived keys.</li>
<li>Prefer apps pulling secrets from Key Vault at runtime over baking them into Terraform variables.</li>
</ul>

<h2>Rollback</h2>
<p>IaC rollback is "apply the previous committed version" (git revert → plan → apply). But it's a <em>roll-forward</em>, not a magic undo — recreating a stateful resource (a database) can lose data. So: review the <code>plan</code> for blast radius, back up stateful resources, and add guardrails — <code>prevent_destroy</code> on critical resources and policy-as-code (OPA/Sentinel) to block dangerous changes.</p>

<div class="say"><strong>Say this:</strong> "I run IaC through CI — plan on every PR so reviewers see the diff, apply on merge with state locked and a manual gate for prod. Secrets come from the pipeline's secret store or OIDC federation, never hardcoded, and state never goes in git because it holds secrets in plaintext. Rollback is applying the previous version via git, but I treat it carefully since recreating a stateful resource can lose data — so I lean on plan review, prevent_destroy, and policy-as-code as guardrails."</div>
`,

"grasp-patterns__information-expert": `
<p class="lead">GRASP (Craig Larman) is nine principles for answering one question: <em>which class should hold this responsibility?</em> <strong>Information Expert</strong> is the most fundamental: assign a responsibility to the class that has the information needed to fulfil it. "Who should do X? The one that holds the data for X."</p>

<h2>How to apply it</h2>
<p>Put behaviour next to the data it needs. An <code>Order</code> owns its line items, so computing the total belongs on <code>Order</code> — not in some external service that reaches in and sums them.</p>
<pre><code>class Order {
  private readonly List&lt;LineItem&gt; _lines = new();
  public decimal Total() =&gt; _lines.Sum(l =&gt; l.Subtotal());   // Order has the lines
}
class LineItem {
  public decimal Subtotal() =&gt; Price * Qty;                   // LineItem has price/qty
}</code></pre>
<p>Each class computes exactly what it has the data for. This is the main defence against the <strong>anemic domain model</strong> — data-only classes with all behaviour piled into a fat service.</p>

<div class="warn"><strong>Don't apply it blindly:</strong> an entity shouldn't also know how to save itself to the database — that would couple the domain to persistence and wreck its cohesion. There, you deliberately <em>break</em> Information Expert and use a Pure Fabrication (a Repository). GRASP is a balance of all nine principles, not one rule.</div>

<div class="say"><strong>Say this:</strong> "Information Expert says put behaviour where the data lives — Order.Total() belongs on Order because it owns the line items. It's the main cure for anemic domain models. But I balance it against coupling: an entity shouldn't know how to persist itself, so persistence goes to a Pure Fabrication like a repository."</div>
`,

"grasp-patterns__creator": `
<p class="lead"><strong>Creator</strong> answers: who should create an instance of class A? Assign creation to a class B that <em>aggregates, contains, closely uses, or has the initializing data for</em> A. It keeps object creation where it naturally belongs and stops <code>new</code> from being scattered everywhere.</p>

<h2>How to apply it</h2>
<p>An <code>Order</code> contains its <code>LineItem</code>s and has the data to initialize them, so <code>Order</code> creates them. A <code>Customer</code> creates its <code>Order</code>s.</p>
<pre><code>class Order {
  private readonly List&lt;LineItem&gt; _lines = new();
  // Order aggregates LineItems and has the data -&gt; Order creates them
  public void AddLine(Product p, int qty) =&gt; _lines.Add(new LineItem(p, qty));
}</code></pre>

<h2>When to delegate instead</h2>
<p>When construction is complex, or you must decouple the caller from the <em>concrete</em> type, hand creation to a <strong>Factory</strong> (a Pure Fabrication) or a <strong>DI container</strong>. Creator points you to the natural owner; a Factory handles complexity and abstraction.</p>

<div class="say"><strong>Say this:</strong> "Creator assigns instantiation to the class that contains or closely uses the new object — an Order creates its LineItems because it aggregates them and holds the data. When creation gets complex or I need to hide the concrete type, I switch to a Factory or let the DI container create it."</div>
`,

"grasp-patterns__controller": `
<p class="lead"><strong>Controller</strong> answers: what first object <em>beyond the UI layer</em> receives and coordinates a system operation (a user action or request)? A controller — a use-case or façade object — that delegates the real work to domain objects. It separates the UI from domain logic.</p>

<h2>How to apply it</h2>
<p>In ASP.NET the thin API controller (or a MediatR handler / application service) receives the request, coordinates domain objects, and returns a result. It holds <strong>no business logic</strong> — thin controllers, rich domain.</p>
<pre><code>[HttpPost]
public async Task&lt;IActionResult&gt; Place(PlaceOrder cmd) {
    var id = await _mediator.Send(cmd);   // coordinate, don't compute
    return Ok(id);
}</code></pre>
<p>Two flavours: a <em>façade controller</em> representing a whole subsystem, and a <em>use-case controller</em> — one per operation (e.g. <code>PlaceOrderHandler</code>), which scales better as the system grows.</p>

<div class="warn"><strong>Anti-pattern:</strong> a bloated controller that does everything is low-cohesion ("fat controller"). Push logic down into application services and the domain.</div>

<div class="say"><strong>Say this:</strong> "Controller is the first non-UI object that handles a system operation — my ASP.NET controller or a MediatR handler. It coordinates but contains no business logic: thin controllers, rich domain. The moment a controller starts doing the work itself it loses cohesion, so I keep logic in application and domain layers."</div>
`,

"grasp-patterns__low-coupling": `
<p class="lead"><strong>Low Coupling</strong> is an evaluative principle: minimize dependencies between classes so a change in one doesn't ripple, and parts can be reused and tested in isolation. The goal is not <em>zero</em> coupling — some is necessary — but to avoid <em>unnecessary</em> or <em>volatile</em> coupling.</p>

<h2>How to apply it</h2>
<p>Depend on <strong>abstractions</strong>, not concretes; inject dependencies; don't let a class reach into the internals of many others.</p>
<pre><code>// coupled to a concrete, hard to test/replace
class Orders { private readonly SmtpClient _smtp = new(); }

// low coupling: depend on an abstraction, injected
class Orders {
  private readonly IEmailSender _email;
  public Orders(IEmailSender email) =&gt; _email = email;
}</code></pre>
<p>Now <code>Orders</code> can be tested with a mock and the email implementation swapped freely. This is exactly what SOLID's <strong>Dependency Inversion</strong> serves.</p>

<div class="warn"><strong>Balance it:</strong> Low Coupling can pull against Information Expert — putting behaviour on the data owner may couple that class to things it shouldn't know (use Indirection). And coupling to <em>stable</em> things (the framework, <code>System</code> types) is fine; decouple from <em>volatile/external</em> things. Don't over-abstract everything.</div>

<div class="say"><strong>Say this:</strong> "Low coupling is minimizing dependencies so change doesn't ripple and I can test in isolation — I depend on abstractions and inject them, IEmailSender not SmtpClient. But I decouple from volatile and external things, not from everything; coupling to stable types is fine. It's the GRASP goal that Dependency Inversion implements."</div>
`,

"grasp-patterns__high-cohesion": `
<p class="lead"><strong>High Cohesion</strong> is the partner of Low Coupling: keep a class focused on a single, related set of responsibilities so everything in it works toward one purpose. Cohesive classes are easier to understand, change, reuse, and test. Low cohesion produces god classes.</p>

<h2>How to apply it</h2>
<p>A class that both calculates order totals <em>and</em> sends emails has two unrelated jobs — split it.</p>
<pre><code>// low cohesion: two reasons to change in one class
class OrderService { decimal Total(Order o){...} void Email(Order o){...} }

// high cohesion: one job each
class OrderPricing { decimal Total(Order o){...} }
class OrderNotifier { void Email(Order o){...} }</code></pre>
<p>This is essentially the <strong>Single Responsibility Principle</strong> at the class level — "one reason to change." Smells of low cohesion: unrelated method groups, a <code>Manager</code>/<code>Util</code>/<code>Helper</code> that does everything, methods that don't share fields.</p>

<div class="warn"><strong>Balance:</strong> pushing cohesion too far yields a swarm of tiny classes and more wiring/coupling. Cohesion and coupling are tuned together.</div>

<div class="say"><strong>Say this:</strong> "High cohesion means a class does one related job well — the same idea as the Single Responsibility Principle. A class that computes totals <em>and</em> sends email has two reasons to change, so I split it. Cohesion and coupling are a pair: high cohesion and low coupling together, without fragmenting into a hundred micro-classes."</div>
`,

"grasp-patterns__polymorphism": `
<p class="lead"><strong>Polymorphism</strong> says: when behaviour varies by type, assign the responsibility using a polymorphic interface (interface / virtual method) instead of branching on type with <code>if</code>/<code>switch</code>. Adding a new variant then means adding a class, not editing a conditional.</p>

<h2>How to apply it</h2>
<pre><code>// type-switch: every new discount edits this method
decimal Apply(string type, decimal p) =&gt; type switch {
    "seasonal" =&gt; p * 0.9m, "loyalty" =&gt; p - 5, _ =&gt; p };

// polymorphic: a new discount is a new class, callers unchanged
interface IDiscount { decimal Apply(decimal price); }
class SeasonalDiscount : IDiscount { public decimal Apply(decimal p) =&gt; p * 0.9m; }
class LoyaltyDiscount  : IDiscount { public decimal Apply(decimal p) =&gt; p - 5m; }</code></pre>
<p>Each variant is isolated in its own class, and callers stay <strong>closed to modification</strong> — this is how GRASP drives SOLID's <strong>Open/Closed Principle</strong>.</p>

<div class="warn"><strong>Don't over-apply:</strong> a stable two-way branch doesn't need a class hierarchy. Polymorphism pays off when variants are many or expected to grow.</div>

<div class="say"><strong>Say this:</strong> "Polymorphism: when behaviour varies by type, use a polymorphic interface instead of a type switch — a new payment method is a new class, not another case. It's how GRASP delivers Open/Closed. I apply it when variants are many or growing, not for a stable two-way branch where a conditional is simpler."</div>
`,

"grasp-patterns__pure-fabrication": `
<p class="lead"><strong>Pure Fabrication</strong> is the escape hatch: when no domain class is a good home for a responsibility — because assigning it would hurt cohesion or coupling — invent an artificial class that doesn't represent a real-world concept. Repositories, Services, Factories, Mappers, <code>DbContext</code> are all Pure Fabrications.</p>

<h2>Why it exists</h2>
<p>Information Expert would say "the entity with the data should save itself" — but that couples the domain object to the database and shreds its cohesion. So we <em>fabricate</em> a class to hold that responsibility and keep the domain clean.</p>
<pre><code>// fabricated classes that aren't domain concepts:
class OrderRepository { Task Save(Order o); Task&lt;Order&gt; Get(Guid id); }  // persistence
class PricingService  { decimal Price(Cart c, Customer cu); }            // cross-entity logic
class OrderFactory    { Order Create(...); }                            // complex creation</code></pre>
<p>These preserve High Cohesion and Low Coupling even though they aren't "things" in the business domain.</p>

<div class="warn"><strong>The caution:</strong> too many fabrications drain all behaviour out of the entities, giving an anemic domain and procedural "service soup". Fabricate when a domain home would violate cohesion/coupling — not by default.</div>

<div class="say"><strong>Say this:</strong> "Pure Fabrication is inventing a non-domain class when no domain object is a good home — a Repository for persistence, a Service for cross-entity logic. Information Expert would put saving on the entity, but that couples it to the DB and hurts cohesion, so I fabricate a repository. The risk is fabricating so much that the domain goes anemic."</div>
`,

"grasp-patterns__indirection": `
<p class="lead"><strong>Indirection</strong> assigns a responsibility to an intermediate object that mediates between two components so they don't couple directly. The intermediary absorbs the dependency, giving low coupling. Mediators, Controllers, Adapters, event buses, and Repositories are all applications of Indirection.</p>

<h2>How to apply it</h2>
<ul>
<li><strong>Mediator</strong> (MediatR) between a controller and its handlers, so neither references the other directly.</li>
<li><strong>Adapter</strong> between your code and a third-party SDK, so the SDK's types don't leak through your codebase.</li>
<li><strong>Repository</strong> between the domain and the database.</li>
</ul>
<pre><code>// controller depends on a mediator, not on concrete handlers
await _mediator.Send(new PlaceOrder(cart));   // handler resolved behind the indirection</code></pre>
<p>Indirection is the <em>mechanism</em> that delivers Low Coupling and Protected Variations — "add a level of indirection to decouple."</p>

<div class="warn"><strong>Cost:</strong> the old joke is that every problem can be solved with another layer of indirection — except the problem of too many layers. Each one adds complexity and can obscure the flow, so add it where decoupling genuinely pays off.</div>

<div class="say"><strong>Say this:</strong> "Indirection introduces a mediator so two things don't depend on each other directly — MediatR between controller and handler, an adapter around a third-party SDK, a repository between domain and database. It's the mechanism behind low coupling and protected variations. The cost is an extra layer, so I add it where the decoupling earns its keep."</div>
`,

"grasp-patterns__protected-variations": `
<p class="lead"><strong>Protected Variations</strong> is the umbrella principle: identify predicted points of variation or instability and wrap them behind a <em>stable interface</em>, so changes on the other side don't ripple into your code. It's the "why" behind encapsulation, polymorphism, indirection — and SOLID's Open/Closed and Dependency Inversion.</p>

<h2>How to apply it</h2>
<p>Put a stable interface in front of anything volatile — a payment gateway, an external API, a storage mechanism, a rules engine. When the implementation changes, callers behind the interface don't.</p>
<pre><code>interface IPaymentGateway { Task&lt;Result&gt; Charge(Money m, Card c); }
class StripeGateway : IPaymentGateway { ... }
class PayPalGateway : IPaymentGateway { ... }
// swap providers without touching any caller</code></pre>
<p>An <strong>anti-corruption layer</strong> is Protected Variations applied to an external domain model: you translate the partner's model into yours at the boundary so their changes (and their weirdness) can't leak in.</p>

<div class="warn"><strong>Respect YAGNI:</strong> don't build abstractions against variation you don't actually expect — speculative "future-proofing" is waste. Protect the points that genuinely vary.</div>

<div class="say"><strong>Say this:</strong> "Protected Variations wraps predicted points of change behind a stable interface so a change on the far side doesn't ripple — an IPaymentGateway in front of Stripe, an anti-corruption layer around a partner's model. It's the umbrella behind low coupling, polymorphism and indirection. But I only protect variation I actually expect — speculative abstraction is just YAGNI waste."</div>
`,

"c-language-fundamentals__value-vs-reference-types-the-stack-heap-truth": `
<p class="lead">Reference types live on the heap and the variable holds a <em>reference</em>; value types hold their data <em>inline</em>. The popular "value types live on the stack" line is a half-truth — where a value actually lives depends on where it's declared.</p>

<h2>The two kinds</h2>
<ul>
<li><strong>Reference types</strong> (<code>class</code>, <code>string</code>, arrays, delegates): heap-allocated; the variable is a reference. Assigning copies the reference, so both variables point at the <em>same</em> object (aliasing).</li>
<li><strong>Value types</strong> (<code>struct</code>, <code>int</code>, <code>enum</code>, <code>DateTime</code>): data stored inline. Assigning copies the <em>whole value</em>; the copies are independent.</li>
</ul>

<h2>The stack/heap truth</h2>
<p>A <em>local</em> value-type variable sits on the stack — but a value type that's a <strong>field of a heap object lives on the heap</strong>, inline inside that object. Captured locals, boxed values, and <code>async</code> state-machine locals also live on the heap. So storage location is about <em>context</em>, not the type alone.</p>
<pre><code>struct P { public int X; }
var a = new P { X = 1 };
var b = a;            // copies the whole struct
b.X = 2;             // a.X is still 1 (independent copies)

var o1 = new List&lt;int&gt;();
var o2 = o1;          // copies the reference
o2.Add(5);           // o1 sees it too (same object)</code></pre>

<div class="say"><strong>Say this:</strong> "Reference types are on the heap and you copy the reference, which aliases; value types hold data inline and you copy the whole value. 'Value types live on the stack' is a half-truth — a struct that's a field of a class lives on the heap inside that object. The practical gotchas: mutating a struct copy doesn't change the original, and big structs are costly to copy."</div>
`,

"c-language-fundamentals__class-vs-struct-vs-record-when-each": `
<p class="lead">Three ways to define a type, chosen by <strong>identity vs value semantics</strong>, allocation, and mutability.</p>

<table>
<tr><th></th><th>class</th><th>struct</th><th>record</th></tr>
<tr><td>Category</td><td>reference type</td><td>value type</td><td>ref type (or <code>record struct</code>)</td></tr>
<tr><td>Equality</td><td>identity</td><td>value (field-wise)</td><td>value (generated)</td></tr>
<tr><td>Storage</td><td>heap</td><td>inline / stack</td><td>heap</td></tr>
<tr><td>Use for</td><td>entities, services</td><td>small immutable values</td><td>DTOs, messages, value objects</td></tr>
</table>

<h2>When to reach for each</h2>
<ul>
<li><strong>class</strong> — the default: anything with behaviour, identity, or mutable state (entities, services).</li>
<li><strong>struct</strong> — small (rule of thumb ~16 bytes), immutable, short-lived values (a <code>Point</code>, a key) to avoid a heap allocation. <em>Big or mutable</em> structs are a trap: expensive copies, mutation-on-a-copy bugs, and accidental boxing.</li>
<li><strong>record</strong> — when the type is <em>defined by its data</em>: value-based equality plus <code>with</code> expressions for non-destructive copies. <code>record</code> is a reference type with value equality; <code>record struct</code> is a value type with value equality.</li>
</ul>
<pre><code>record Money(decimal Amount, string Currency);   // value equality + with
var a = new Money(10, "EUR");
var b = a with { Amount = 20 };                   // non-destructive copy
// a == new Money(10, "EUR")  -> true  (same values)</code></pre>

<div class="say"><strong>Say this:</strong> "class is a reference type with identity equality — my default for entities and services. struct is a value type copied by value — only for small, immutable, short-lived values to avoid heap allocation; big or mutable structs are a trap. record gives value equality and with-expressions — ideal for DTOs, messages and value objects where 'equal' means 'same data'."</div>
`,

"c-language-fundamentals__generics-covariance-contravariance-in-out": `
<p class="lead">Generics give type-safe, reusable code with no boxing (<code>List&lt;int&gt;</code> stores ints directly). <strong>Variance</strong> controls when a generic interface/delegate of one type argument can substitute for another.</p>

<h2>Constraints</h2>
<p><code>where T : class</code>, <code>struct</code>, <code>new()</code>, a base type/interface, or <code>notnull</code> — restrict what <code>T</code> can be and unlock operations on it.</p>

<h2>Covariance and contravariance</h2>
<ul>
<li><strong>Covariance (<code>out T</code>)</strong>: a more-derived type substitutes. <code>IEnumerable&lt;string&gt;</code> is assignable to <code>IEnumerable&lt;object&gt;</code> — because you only <em>read</em> Ts <em>out</em> (a producer).</li>
<li><strong>Contravariance (<code>in T</code>)</strong>: a less-derived type substitutes. <code>Action&lt;object&gt;</code> is assignable to <code>Action&lt;string&gt;</code> — because you only <em>pass</em> Ts <em>in</em> (a consumer).</li>
</ul>
<pre><code>IEnumerable&lt;string&gt; strings = new[]{ "a", "b" };
IEnumerable&lt;object&gt; objs = strings;     // covariance (out)

Action&lt;object&gt; log = o =&gt; Console.WriteLine(o);
Action&lt;string&gt; logStr = log;            // contravariance (in)</code></pre>

<div class="warn"><strong>Mnemonic:</strong> <code>out</code> = covariant = producer (output); <code>in</code> = contravariant = consumer (input). Only <em>interfaces and delegates</em> can be variant — classes cannot — and only for <em>reference types</em> (value types would need boxing).</div>

<div class="say"><strong>Say this:</strong> "Generics give type safety and avoid boxing. Variance is about substitution: out T is covariant, so IEnumerable&lt;string&gt; works as IEnumerable&lt;object&gt; because you only read Ts out; in T is contravariant, so Action&lt;object&gt; works as Action&lt;string&gt; because you only pass Ts in. Out is producer, in is consumer — and only interfaces and delegates are variant."</div>
`,

"c-language-fundamentals__delegates-func-action-events-multicast": `
<p class="lead">A delegate is a type-safe reference to a method; <code>Func</code>/<code>Action</code> are the built-in generic ones. An <strong>event</strong> is a delegate with restricted access; a <strong>multicast</strong> delegate chains several handlers.</p>

<h2>The built-ins</h2>
<ul>
<li><code>Func&lt;...,TResult&gt;</code> returns a value; <code>Action&lt;...&gt;</code> returns void; <code>Predicate&lt;T&gt;</code> returns bool.</li>
</ul>

<h2>Multicast gotchas</h2>
<p><code>+=</code> chains handlers, invoked in order. But an <strong>exception in one handler stops the rest</strong>, and the return value is only the <strong>last</strong> handler's — so multicast with return values is rarely what you want.</p>

<h2>Events</h2>
<p>An event is a delegate member with access restricted so that <em>outside</em> the class you can only <code>+=</code>/<code>-=</code> — not invoke or overwrite it. Publisher raises, subscribers listen. Use <code>EventHandler&lt;T&gt;</code> and raise safely with <code>handler?.Invoke(this, args)</code>.</p>

<div class="warn"><strong>Top managed leak:</strong> the publisher holds a reference to each subscriber. Forgetting to <code>-=</code> keeps the subscriber (and everything it roots) alive for the publisher's lifetime. Always unsubscribe, or use weak events.</div>

<div class="say"><strong>Say this:</strong> "A delegate is a typed method reference; Func/Action are the built-ins; an event is a delegate with access restricted to +=/-= from outside. The classic bugs: in a multicast delegate an exception in one handler stops the rest and you only get the last return value; and forgetting to unsubscribe leaks the subscriber because the publisher holds a reference to it."</div>
`,

"c-language-fundamentals__equals-vs-and-the-gethashcode-contract": `
<p class="lead"><code>==</code> is a compile-time, overloadable operator; <code>Equals</code> is a virtual runtime method. For reference types both default to <em>reference</em> equality. If you override <code>Equals</code> you <strong>must</strong> override <code>GetHashCode</code> too — or your type breaks in hashed collections.</p>

<h2>The distinction</h2>
<ul>
<li><code>==</code>: reference equality by default for classes; overloadable (<code>string</code> overloads it to value equality).</li>
<li><code>Equals</code>: virtual; override for value equality. Implement <code>IEquatable&lt;T&gt;</code> for a typed, boxing-free comparison.</li>
</ul>

<h2>The GetHashCode contract</h2>
<ul>
<li>Equal objects <strong>must</strong> return equal hash codes (the reverse need not hold — collisions are allowed).</li>
<li>A hash must be <strong>stable while the object is a key</strong>. Never derive it from mutable fields — mutating a key changes its bucket and you "lose" it in the <code>Dictionary</code>/<code>HashSet</code>.</li>
</ul>
<pre><code>// prefer HashCode.Combine for a correct, well-distributed hash
public override int GetHashCode() =&gt; HashCode.Combine(FirstName, LastName);</code></pre>
<p><code>record</code> types generate correct value-equality and hashing for you — a key reason they're great as dictionary keys and DTOs.</p>

<div class="say"><strong>Say this:</strong> "== is an overloadable compile-time operator; Equals is virtual and runtime. If I override Equals I must override GetHashCode so equal objects share a hash — otherwise they break in Dictionary and HashSet. Hash codes must be stable while the object is a key, so never derive them from mutable fields. Records generate all of this correctly."</div>
`,

"c-language-fundamentals__boxing-and-unboxing": `
<p class="lead">Boxing wraps a value type in a heap object so it can be treated as <code>object</code> (or an interface); unboxing extracts it back. Each box is a <strong>heap allocation + copy</strong> — real GC pressure in a hot loop.</p>

<h2>Where it sneaks in</h2>
<ul>
<li>Passing a struct to an <code>object</code> parameter (including <code>string.Format</code> / old-style formatting with <code>object[]</code> args).</li>
<li>Non-generic collections (<code>ArrayList</code>, <code>Hashtable</code>) or <code>List&lt;object&gt;</code>.</li>
<li>Calling an interface method on a struct through the interface (unless via a constrained generic).</li>
</ul>
<pre><code>ArrayList list = new();
list.Add(42);          // boxes the int

List&lt;int&gt; fast = new();
fast.Add(42);          // no boxing — stored as int</code></pre>

<h2>How to avoid it</h2>
<p>Use generics (<code>List&lt;int&gt;</code> not <code>ArrayList</code>), generic constraints, <code>Span&lt;T&gt;</code>, and overloads that take the value type directly.</p>

<div class="say"><strong>Say this:</strong> "Boxing wraps a value type in a heap object to treat it as object; each box is an allocation plus a copy, so in a tight loop it creates GC pressure. It sneaks in through object parameters, non-generic collections, and calling an interface method on a struct. I avoid it with generics and generic constraints — List&lt;int&gt;, not ArrayList."</div>
`,

"c-language-fundamentals__nullable-reference-types": `
<p class="lead">With Nullable Reference Types enabled (<code>&lt;Nullable&gt;enable&lt;/Nullable&gt;</code>), the compiler tracks whether a reference should be null: <code>string</code> is non-null, <code>string?</code> is nullable. It warns when you dereference something possibly null or assign null to a non-nullable. It's <strong>compile-time only</strong> — no runtime enforcement.</p>

<h2>What it buys you</h2>
<p>It catches <code>NullReferenceException</code> — the most common .NET bug — before it ships, by turning "might be null" into a compiler warning.</p>

<h2>The catch</h2>
<ul>
<li>Because it's compile-time, a caller <em>without</em> NRTs (or using reflection/deserialization) can still pass null. <strong>Guard public API boundaries</strong> with real checks: <code>ArgumentNullException.ThrowIfNull(x)</code>.</li>
<li>The null-forgiving operator <code>!</code> suppresses a warning — use it sparingly, because you're overriding the compiler's analysis.</li>
</ul>

<div class="say"><strong>Say this:</strong> "Nullable reference types make the compiler track nullability — string vs string? — and warn on dereferencing a possibly-null value. It's compile-time only, so I still guard public boundaries with ArgumentNullException.ThrowIfNull, because a caller without NRTs or a deserializer can pass null. The payoff is catching NREs before they ship, and I use the null-forgiving ! sparingly."</div>
`,

"c-language-fundamentals__string-immutability-stringbuilder-interning": `
<p class="lead">Strings are <strong>immutable</strong> — every concatenation allocates a new string. In a loop that's O(n²) garbage and GC pressure. Build with <code>StringBuilder</code>; interning shares identical literals.</p>

<h2>Why immutable, and the cost</h2>
<p>Immutability makes strings thread-safe, safe as dictionary keys, and cacheable. The cost is that mutation isn't possible — each concat produces a new object.</p>
<pre><code>// O(n^2) allocations
string s = "";
foreach (var x in items) s += x;         // new string every iteration

// build once
var sb = new StringBuilder();
foreach (var x in items) sb.Append(x);
string result = sb.ToString();            // or string.Join(...) for a collection</code></pre>
<p>Interpolation and <code>+</code> are fine for a few pieces; use <code>StringBuilder</code> or <code>string.Join</code>/<code>Concat</code> for loops and collections.</p>

<h2>Interning</h2>
<p>The runtime keeps one copy of identical <em>literals</em> in a shared pool (literals are auto-interned; <code>string.Intern</code> interns dynamic strings). It saves memory when the same string repeats a lot — but interned strings are <strong>pinned for the app's lifetime</strong>, so never intern unbounded user input. For allocation-free parsing use <code>ReadOnlySpan&lt;char&gt;</code> / <code>string.AsSpan()</code>.</p>

<div class="say"><strong>Say this:</strong> "Strings are immutable, so each concatenation allocates — a loop of concatenations is O(n²) garbage. I build with StringBuilder or string.Join. Interning keeps one copy of identical literals, saving memory when strings repeat, but interned strings are pinned for the app's life, so I don't intern unbounded input. For hot parsing I use ReadOnlySpan&lt;char&gt;."</div>
`,

"c-language-fundamentals__exception-handling-best-practices": `
<p class="lead">Catch only what you can handle; let everything else bubble to a global handler. Preserve stack traces, throw specific exceptions, and never use exceptions for control flow.</p>

<h2>The rules</h2>
<ul>
<li><strong>Don't swallow.</strong> Catch only what you can act on; an empty <code>catch</code> hides bugs. Let unexpected exceptions reach a global handler (ASP.NET middleware) that logs and returns <code>ProblemDetails</code>.</li>
<li><strong>Preserve the stack:</strong> <code>throw;</code> rethrows keeping the original trace. <code>throw ex;</code> <em>resets</em> it — avoid.</li>
<li><strong>Be specific:</strong> throw domain-specific/custom exceptions and map them to status codes at the boundary.</li>
<li><strong>Exception filters:</strong> <code>catch (X e) when (cond)</code> — filter without catching, inspecting, and rethrowing.</li>
<li><strong>Not control flow:</strong> exceptions are expensive — use <code>TryParse</code> / a <code>Result</code> type for <em>expected</em> failures. Clean up with <code>using</code>/<code>finally</code>.</li>
</ul>

<div class="say"><strong>Say this:</strong> "I catch only what I can actually handle and let the rest bubble to a global handler that logs and returns ProblemDetails — an empty catch hides bugs. I use throw; to preserve the stack, throw specific exceptions mapped to status codes at the boundary, and exception filters instead of catch-inspect-rethrow. Exceptions aren't control flow — for expected failures I use TryParse or a Result type."</div>
`,

"c-language-fundamentals__idisposable-using-iasyncdisposable": `
<p class="lead">The GC reclaims managed memory but doesn't know about <strong>unmanaged resources</strong> — file handles, sockets, DB connections. <code>IDisposable.Dispose()</code> releases them deterministically; <code>using</code> guarantees it runs; <code>IAsyncDisposable</code> / <code>await using</code> handle async cleanup.</p>

<h2>How to use it</h2>
<pre><code>using var conn = new SqlConnection(cs);   // Dispose() runs at scope end, even on exception
await using var stream = File.OpenRead(path);  // async cleanup (flush/drain)</code></pre>
<ul>
<li>Dispose the <code>IDisposable</code> fields you own. Add a <strong>finalizer only if you directly hold a raw unmanaged handle</strong> — and prefer a <code>SafeHandle</code>, which finalizes itself, so your class needs none.</li>
<li>In <code>Dispose</code>, call <code>GC.SuppressFinalize(this)</code> so the finalizer is skipped once you've cleaned up.</li>
</ul>

<div class="warn"><strong>The symptom of a leak here isn't memory</strong> — it's handle/connection exhaustion: "too many open files", "connection pool timeout". Forgetting to dispose an <code>HttpResponseMessage</code> or a <code>DbConnection</code> is a common cause.</div>

<div class="say"><strong>Say this:</strong> "The GC frees managed memory but not unmanaged resources like file handles and DB connections — IDisposable.Dispose releases them deterministically, and using guarantees it runs even on exception. I add a finalizer only if I directly own a raw handle, and prefer a SafeHandle which finalizes itself. For async cleanup there's IAsyncDisposable and await using. A leak here shows up as handle or connection-pool exhaustion, not memory."</div>
`,

"c-language-fundamentals__span-t-memory-t-for-performance": `
<p class="lead"><code>Span&lt;T&gt;</code> is a stack-only view over contiguous memory (an array, the stack, or unmanaged memory) that lets you slice and process data with <strong>no allocation or copy</strong>. <code>Memory&lt;T&gt;</code> is the heap-storable equivalent you can hold in a field or use across <code>await</code>.</p>

<h2>Span&lt;T&gt;</h2>
<p>It's a <code>ref struct</code>, so it's stack-only: it <strong>can't live on the heap, be a field of a class, or cross an <code>await</code></strong>. Use it to slice strings and buffers allocation-free, often with <code>stackalloc</code> for small buffers.</p>
<pre><code>ReadOnlySpan&lt;char&gt; s = "2026-11-24".AsSpan();
int year = int.Parse(s.Slice(0, 4));     // no substring allocation</code></pre>

<h2>Memory&lt;T&gt;</h2>
<p>Use <code>Memory&lt;T&gt;</code> where <code>Span</code> can't reach — async methods and class fields — and get a <code>Span</code> from it via <code>.Span</code> at the point of use. Pair with <code>ArrayPool&lt;T&gt;</code> to reuse buffers on hot paths.</p>

<div class="warn"><strong>Reach for these on measured hot paths only</strong> — readability first everywhere else.</div>

<div class="say"><strong>Say this:</strong> "Span&lt;T&gt; is a stack-only view over contiguous memory that lets me slice and parse buffers and strings with zero allocation. Because it's a ref struct it can't live on the heap or cross an await — there I use Memory&lt;T&gt;. I combine Span with stackalloc and ArrayPool on measured hot paths, but keep it off the cold paths where readability matters more."</div>
`,

"c-language-fundamentals__solid-with-a-concrete-net-example-for-each": `
<p class="lead">Five principles whose <em>end goal</em> is low coupling, high cohesion, and easy change — not dogma.</p>

<h2>The five, with a .NET example each</h2>
<ul>
<li><strong>S — Single Responsibility:</strong> one reason to change. Split an <code>OrderService</code> that both calculates totals and sends email into two classes.</li>
<li><strong>O — Open/Closed:</strong> open to extension, closed to modification. Add a new <code>IDiscount</code> implementation instead of editing a growing <code>switch</code>.</li>
<li><strong>L — Liskov Substitution:</strong> a subtype must work anywhere the base does. A <code>ReadOnlyList</code> that throws on <code>Add</code> violates it — callers of the base contract break.</li>
<li><strong>I — Interface Segregation:</strong> many small interfaces over one fat one. Split <code>IRepository</code> into <code>IReadRepository</code> / <code>IWriteRepository</code> so clients don't depend on methods they don't use.</li>
<li><strong>D — Dependency Inversion:</strong> depend on abstractions, not concretes. Inject <code>IEmailSender</code>, not <code>SmtpClient</code> — DI wires the implementation.</li>
</ul>

<div class="warn"><strong>Lead framing:</strong> SOLID is a means to an end — low coupling, high cohesion, easy change. Applied dogmatically it over-engineers; <strong>KISS and YAGNI</strong> keep it honest. Expect the interview question "give an example where you'd deliberately <em>not</em> follow a principle."</div>

<div class="say"><strong>Say this:</strong> "SOLID: Single Responsibility — split a class with two jobs; Open/Closed — add an IDiscount instead of editing a switch; Liskov — a subtype must honour the base contract, so a read-only list that throws on Add violates it; Interface Segregation — small focused interfaces; Dependency Inversion — inject IEmailSender not SmtpClient. But SOLID serves low coupling and easy change — I balance it with KISS and YAGNI rather than applying it as a religion."</div>
`,

"c-language-fundamentals__async-void-why-dangerous-when-acceptable": `
<p class="lead">An <code>async</code> method can return <code>Task</code>, <code>Task&lt;T&gt;</code>, <code>ValueTask</code>, or <code>void</code>. <strong><code>async void</code> is fire-and-forget and dangerous</strong>: you can't await it, and an unhandled exception crashes the process.</p>

<h2>Why it's dangerous</h2>
<ul>
<li><strong>Can't await it:</strong> you never know when it finished and can't compose it.</li>
<li><strong>Exceptions escape:</strong> an unhandled exception in <code>async void</code> is raised on the sync context (not returned in a <code>Task</code> you can catch) and <strong>crashes the process</strong>.</li>
</ul>

<h2>The fix, and the one exception</h2>
<p>Always return <code>Task</code> instead — even for fire-and-forget (then observe it). The one legitimate use is a <strong>top-level event handler</strong> (<code>button.Click += async (s,e) =&gt; ...</code>), where the delegate signature forces <code>void</code> — and there you wrap the body in <code>try/catch</code>.</p>

<div class="say"><strong>Say this:</strong> "async void is fire-and-forget: you can't await it, so you can't observe completion or catch its exceptions — an unhandled one crashes the process instead of surfacing in a Task. I always return async Task, even for fire-and-forget. The only legitimate async void is a top-level event handler where the signature forces it, and there I wrap the whole body in try/catch."</div>
`,

"c-language-fundamentals__yield-return-deferred-execution": `
<p class="lead">An iterator (<code>yield return</code>) builds an <code>IEnumerable&lt;T&gt;</code> that produces items <em>lazily</em> — nothing runs until you enumerate, and only as far as you consume. This is why LINQ is deferred.</p>

<h2>How it works</h2>
<p>The compiler rewrites the iterator into a state machine; each <code>MoveNext</code> resumes execution at the last <code>yield</code>.</p>
<pre><code>IEnumerable&lt;int&gt; Evens(IEnumerable&lt;int&gt; src) {
    foreach (var n in src)
        if (n % 2 == 0) yield return n;   // runs on demand, one item at a time
}</code></pre>
<p>Because of this, <code>Where().Select()</code> compose without materializing until <code>ToList()</code> or <code>foreach</code>.</p>

<div class="warn"><strong>Two gotchas:</strong> enumerating the sequence twice <em>re-runs</em> the whole pipeline (and re-queries a database); and argument validation / exceptions in the method body don't fire until the <em>first</em> <code>MoveNext</code>, so validate eagerly by splitting the public method from a private iterator.</div>

<div class="say"><strong>Say this:</strong> "yield return builds a lazy IEnumerable — the compiler turns it into a state machine that runs on demand, producing items only as you consume them. That's why LINQ is deferred and composes cheaply. The gotchas: enumerating twice re-runs the whole pipeline, re-querying a DB, and argument validation doesn't fire until the first MoveNext unless I split the method."</div>
`,

"c-language-fundamentals__modern-c-features-pattern-matching-primary-constructors-collection-exp": `
<p class="lead">Recent C# (8–13) adds expressiveness and removes ceremony. The ones a tech lead should know — and when to use them.</p>

<h2>Worth knowing</h2>
<ul>
<li><strong>Pattern matching:</strong> switch expressions and type / property / relational / list patterns — replace nested <code>if</code>/<code>switch</code>, great for parsing and dispatch.</li>
<li><strong>Records &amp; record struct:</strong> value equality + <code>with</code> expressions for DTOs and value objects.</li>
<li><strong>Primary constructors (C# 12):</strong> declare constructor parameters on the type and use them in the body — less boilerplate, handy for DI.</li>
<li><strong>Collection expressions (C# 12):</strong> <code>[1, 2, 3]</code> and the spread <code>..items</code> — uniform, terse collection initialization.</li>
<li><strong>required / init-only members:</strong> immutable-after-construction, and enforce required properties without a big constructor.</li>
<li>Plus: file-scoped namespaces, global usings, raw string literals, target-typed <code>new()</code>.</li>
</ul>
<pre><code>decimal Fee(Account a) =&gt; a switch {       // switch expression + patterns
    { Tier: "gold" }         =&gt; 0m,
    { Balance: &gt; 10_000m }    =&gt; 1m,
    _                        =&gt; 5m
};</code></pre>

<div class="say"><strong>Say this:</strong> "Modern C# is about expressing intent with less ceremony: switch expressions and pattern matching for dispatch and parsing, records for value objects, primary constructors and collection expressions to cut boilerplate, and required/init for immutable-after-construction models. I adopt them where they improve clarity, not for novelty — the team still has to read it."</div>
`,

"clr-runtime-gc__clr-the-managed-execution-model": `
<p class="lead">The Common Language Runtime is .NET's virtual machine. Your C# compiles to IL; at runtime the CLR JIT-compiles IL to native code and provides the services that make code "managed".</p>
<h2>What it provides</h2>
<ul>
<li><strong>Garbage collection</strong> — automatic memory management.</li>
<li><strong>Type safety</strong> and the Common Type System.</li>
<li><strong>Exception handling</strong> and <strong>security</strong>.</li>
<li><strong>JIT compilation</strong> of IL to native code.</li>
</ul>
<p>"Managed" means the runtime handles memory and safety for you — the opposite of C/C++ where you manage it manually. The CLR sits between your IL and the OS, giving platform independence and safety; the price is JIT warm-up and GC pauses.</p>
<div class="say"><strong>Say this:</strong> "The CLR is .NET's VM — it JIT-compiles IL to native and provides GC, type safety, exceptions and security, which is what 'managed' means. It sits between my IL and the OS for platform independence and safety; the trade-off is JIT warm-up and GC pauses."</div>
`,

"clr-runtime-gc__c-il-jit-native": `
<p class="lead">.NET compiles in two stages. The C# compiler (Roslyn) produces IL (CIL) plus metadata, packaged in an assembly (.dll/.exe) — <em>not</em> native code. At runtime the JIT compiles each method's IL to native machine code the first time it's called, then caches it.</p>
<h2>Why two stages</h2>
<ul>
<li><strong>Platform independence:</strong> one IL, a per-platform JIT.</li>
<li><strong>Runtime optimization:</strong> the JIT knows the actual CPU and the real types in play.</li>
<li><strong>Verifiability:</strong> IL can be checked for type safety before it runs.</li>
</ul>
<div class="say"><strong>Say this:</strong> "C# compiles to IL plus metadata in an assembly, not machine code. The JIT compiles each method's IL to native on first call and caches it. Two stages give platform independence — one IL, a per-platform JIT — plus runtime optimization because the JIT knows the real CPU and types, and verifiable type safety."</div>
`,

"clr-runtime-gc__tiered-compilation": `
<p class="lead">Modern .NET JITs in tiers to balance startup against throughput.</p>
<ul>
<li><strong>Tier 0 (quick JIT):</strong> minimal optimization, so methods start running fast.</li>
<li><strong>Tier 1 (optimizing JIT):</strong> methods that run often are recompiled with full optimizations — inlining, loop unrolling, better register allocation.</li>
</ul>
<p>So the app starts quickly and still reaches peak performance on hot paths, automatically. It pairs with Dynamic PGO, which Tier 0 uses to collect profiling data that Tier 1 then exploits.</p>
<div class="say"><strong>Say this:</strong> "Tiered compilation JITs hot paths twice: Tier 0 is a quick, barely-optimized compile so the app starts fast, then methods that run often are recompiled at Tier 1 with full optimizations. You get fast startup and peak throughput without choosing, and it pairs with dynamic PGO."</div>
`,

"clr-runtime-gc__profile-guided-optimization-pgo": `
<p class="lead">Profile-Guided Optimization feeds runtime behaviour back into the JIT so it optimizes for your actual workload. <strong>Dynamic PGO</strong> (on by default since .NET 8) instruments Tier-0 code to learn which branches and types are hot, then Tier-1 uses that profile.</p>
<h2>What it enables</h2>
<ul>
<li><strong>Devirtualization</strong> of interface/virtual calls that turn out to be monomorphic.</li>
<li>Better <strong>inlining</strong> decisions and <strong>branch layout</strong> for the common path.</li>
</ul>
<p>The net effect is code tuned to how the app really runs — an advantage long-running JIT services have over Native AOT, which can't observe runtime behaviour.</p>
<div class="say"><strong>Say this:</strong> "PGO feeds runtime profiles back into the JIT. Dynamic PGO instruments Tier-0 to learn which branches and types are hot, then Tier-1 devirtualizes, inlines and lays out branches for the real workload. It's why a long-running JIT service can out-optimize Native AOT, which can't watch itself run."</div>
`,

"clr-runtime-gc__native-aot-vs-readytorun-vs-jit": `
<p class="lead">Three ways IL becomes native code, trading startup and footprint against runtime flexibility.</p>
<table>
<tr><th>Mode</th><th>How</th><th>Trade-off</th></tr>
<tr><td>JIT</td><td>compile at runtime</td><td>startup/warm-up latency; best peak via PGO</td></tr>
<tr><td>ReadyToRun (R2R)</td><td>precompiled native + IL fallback</td><td>cuts startup; larger binaries; keeps the JIT</td></tr>
<tr><td>Native AOT</td><td>fully ahead-of-time, self-contained native, no JIT</td><td>fastest startup, lowest memory; limited reflection, no runtime codegen, requires trimming</td></tr>
</table>
<h2>Pick by workload</h2>
<ul>
<li><strong>Native AOT:</strong> CLI tools, serverless, small containers — fastest startup, smallest footprint.</li>
<li><strong>R2R:</strong> cut startup while keeping the JIT's runtime optimization.</li>
<li><strong>JIT (+ PGO):</strong> long-running servers that benefit from optimizing for real runtime behaviour.</li>
</ul>
<div class="say"><strong>Say this:</strong> "JIT compiles at runtime; ReadyToRun ships precompiled native with an IL fallback to cut startup; Native AOT compiles fully ahead-of-time to a native binary with no JIT. AOT wins startup and footprint for CLI tools and serverless but loses runtime optimization and breaks reflection-heavy code; for long-running servers I keep JIT plus PGO."</div>
`,

"clr-runtime-gc__trimming-its-hazards": `
<p class="lead">Trimming (the IL linker) removes unused code and assemblies from a self-contained or AOT publish, shrinking size and startup — important for containers, serverless, and cloud-native deploys. It's a prerequisite for Native AOT.</p>
<div class="warn"><strong>The hazard:</strong> reflection-based code can reference types the trimmer can't "see", so it strips them, and you get a runtime "type not found" failure that never showed up in a normal build.</div>
<p>Guard it with trim annotations (<code>[DynamicDependency]</code>, <code>[RequiresUnreferencedCode]</code>) so the linker keeps what reflection needs — or, better, switch reflection-heavy code to <strong>source generators</strong>, which the trimmer can see.</p>
<div class="say"><strong>Say this:</strong> "Trimming removes unused code to shrink the binary and startup. The hazard is reflection — the trimmer can't see types resolved by name, strips them, and you get a runtime 'type not found'. I guard with trim annotations or, better, move to source generators. It's also a prerequisite for Native AOT."</div>
`,

"clr-runtime-gc__server-vs-workstation-gc-background-mode": `
<p class="lead">The GC has two flavours plus a concurrency mode, matched to the workload.</p>
<ul>
<li><strong>Workstation GC:</strong> a single heap, tuned for low latency and responsiveness — client/desktop apps and memory-constrained environments.</li>
<li><strong>Server GC:</strong> a separate heap and GC thread per core, tuned for throughput on multi-core servers — the <em>default for ASP.NET Core</em>. Uses more memory.</li>
<li><strong>Background / concurrent GC:</strong> does most Gen-2 work on a background thread to minimize application pauses.</li>
</ul>
<p>Set it with <code>&lt;ServerGarbageCollection&gt;</code> in the csproj.</p>
<div class="say"><strong>Say this:</strong> "Workstation GC is one heap tuned for latency — good for desktop or memory-constrained services. Server GC gives a heap and GC thread per core for throughput and is the ASP.NET Core default, at the cost of memory. Background GC does most Gen-2 collection off-thread to cut pauses. I pick Server for throughput, Workstation for small latency-sensitive services."</div>
`,

"clr-runtime-gc__the-generational-garbage-collector": `
<p class="lead">The GC is generational, built on the observation that <strong>most objects die young</strong>.</p>
<ul>
<li><strong>Gen 0:</strong> newly allocated — collected frequently and cheaply; most objects die here.</li>
<li><strong>Gen 1:</strong> a buffer for objects that survived one collection.</li>
<li><strong>Gen 2:</strong> long-lived objects — collected rarely and expensively (a full GC).</li>
</ul>
<p>Surviving a collection promotes an object to the next generation. Frequent cheap Gen-0 sweeps plus rare Gen-2 sweeps give good throughput. The Large Object Heap is collected together with Gen 2.</p>
<div class="say"><strong>Say this:</strong> "The GC is generational on the premise that most objects die young. Gen 0 is collected often and cheaply — most garbage dies there; survivors promote to Gen 1, then Gen 2, which is collected rarely and expensively. Cheap frequent Gen-0 sweeps plus rare full collections give good throughput, and the Large Object Heap is collected with Gen 2."</div>
`,

"clr-runtime-gc__large-object-heap-fragmentation": `
<p class="lead">Objects of roughly 85KB or more — big arrays, large strings and buffers — go on the Large Object Heap.</p>
<div class="warn"><strong>Why it's a problem:</strong> the LOH is collected only with Gen 2 (expensive) and is <em>not compacted by default</em>, so it fragments — free gaps appear that can't fit new large objects, and memory grows even though there's "free" space.</div>
<h2>How to handle it</h2>
<ul>
<li>Reduce large transient allocations: <strong>pool buffers with <code>ArrayPool&lt;T&gt;</code></strong>, stream/chunk instead of loading whole payloads, reuse buffers.</li>
<li>You can force LOH compaction occasionally (<code>GCSettings.LargeObjectHeapCompactionMode</code>), but avoiding the allocations is better.</li>
</ul>
<div class="say"><strong>Say this:</strong> "Objects over about 85KB go on the Large Object Heap, which is collected only with Gen 2 and isn't compacted by default, so it fragments — free gaps that can't fit new big objects, and memory grows. I cut large transient allocations: pool buffers with ArrayPool, stream or chunk instead of loading whole payloads. Forcing LOH compaction is a last resort."</div>
`,

"clr-runtime-gc__gc-generations-loh-how-managed-memory-leaks-happen": `
<p class="lead">"Managed" doesn't mean leak-proof. A leak is objects that stay <em>reachable forever</em>, so the GC can never collect them — the heap grows until the process is killed.</p>
<h2>The common leak sources</h2>
<ul>
<li><strong>Un-unsubscribed event handlers</strong> — the publisher holds a reference to the subscriber, pinning it (and everything it roots). The single most common managed leak.</li>
<li><strong>Static collections that only grow</strong> (a cache or list that's never pruned).</li>
<li><strong>Undisposed <code>IDisposable</code></strong> holding native handles; <strong>captured closures</strong>; <strong>caches without eviction</strong>.</li>
</ul>
<h2>Fix &amp; diagnose</h2>
<p>Dispose/using for unmanaged resources; unsubscribe events (or use weak events); bound caches with size + TTL; pool LOH buffers. Diagnose by comparing <strong>dotnet-gcdump snapshots</strong> and looking at what <em>roots</em> the growing objects.</p>
<div class="say"><strong>Say this:</strong> "Managed memory still leaks when objects stay reachable forever — static collections that only grow, event handlers never unsubscribed, undisposed handles, unbounded caches. The most common is an event handler never unsubscribed, because the publisher keeps the subscriber alive. I diagnose by diffing gcdump snapshots to see what's rooting the growth, and fix with dispose, unsubscribe and bounded caches."</div>
`,

"clr-runtime-gc__finalizers-vs-dispose-when-you-need-a-finalizer": `
<p class="lead"><code>Dispose</code> (via <code>using</code>) is deterministic cleanup you trigger. A <strong>finalizer</strong> (<code>~Type()</code>) is a GC-run safety net that runs only if <code>Dispose</code> wasn't called.</p>
<h2>Why finalizers are costly</h2>
<p>Finalization is non-deterministic and expensive — a finalizable object <em>survives an extra GC cycle</em> (it's promoted, queued, finalized on the finalizer thread, then collected on the next GC).</p>
<h2>The rule</h2>
<ul>
<li>Add a finalizer <strong>only when you directly own a raw unmanaged handle</strong> — and prefer a <code>SafeHandle</code>, which finalizes itself, so your class needs none.</li>
<li>In <code>Dispose</code>, call <code>GC.SuppressFinalize(this)</code> so the finalizer is skipped once you've cleaned up.</li>
</ul>
<div class="say"><strong>Say this:</strong> "Dispose is deterministic cleanup I trigger; a finalizer is a GC-run safety net that runs if Dispose wasn't called. Finalization is costly and non-deterministic — the object survives an extra GC cycle. So I add a finalizer only when I directly own a raw handle, and prefer a SafeHandle which finalizes itself. Dispose calls GC.SuppressFinalize to skip it."</div>
`,

"clr-runtime-gc__managed-vs-unmanaged-code-where-dispose-fits": `
<p class="lead">Managed code runs under the CLR with GC and type safety. <strong>Unmanaged resources</strong> — OS file handles, sockets, DB connections, native memory via P/Invoke — are <em>not</em> tracked by the GC.</p>
<p>So a managed object that wraps an unmanaged resource must release it <strong>deterministically</strong> via <code>IDisposable.Dispose()</code> (ideally wrapping a <code>SafeHandle</code>). That boundary is exactly why <code>using</code>/<code>Dispose</code> exist — the GC frees managed memory but won't close your file handle or return your connection to the pool.</p>
<div class="say"><strong>Say this:</strong> "Managed code runs under the CLR with GC and type safety; unmanaged resources like file handles and sockets aren't tracked by the GC. So a managed wrapper around an unmanaged resource must release it deterministically through Dispose, ideally via a SafeHandle. That's the whole reason using/Dispose exists — the GC reclaims memory but won't close your handle."</div>
`,

"clr-runtime-gc__reflection-cost-how-to-reduce-it": `
<p class="lead">Reflection (<code>Type.GetMethod</code>, <code>Invoke</code>, <code>Activator.CreateInstance</code>) inspects and invokes types at runtime — it powers DI, serializers and ORMs — but it's slow (metadata lookups, no inlining, boxing) and AOT/trim-unfriendly.</p>
<h2>How to reduce the cost</h2>
<ul>
<li><strong>Cache</strong> the <code>MethodInfo</code>/<code>PropertyInfo</code> instead of re-resolving it every call.</li>
<li><strong>Compile once:</strong> build a delegate with <code>Expression.Compile()</code> or <code>Delegate.CreateDelegate</code> and reuse it — near-native speed after the one-time cost.</li>
<li><strong>Source generators</strong> move the work to compile time entirely.</li>
</ul>
<div class="say"><strong>Say this:</strong> "Reflection inspects and invokes types at runtime — it powers DI and serializers but it's slow and AOT-hostile. I cache the MethodInfo/PropertyInfo instead of re-resolving, and for hot paths compile a reusable delegate with Expression.Compile so it runs near native speed. Better still, source generators move the work to compile time."</div>
`,

"clr-runtime-gc__source-generators-vs-reflection": `
<p class="lead">A source generator is a Roslyn component that runs <em>at compile time</em>, inspects your code, and emits additional C# that is compiled in — with no runtime reflection.</p>
<h2>Why it matters</h2>
<ul>
<li>Used by <code>System.Text.Json</code>, <code>[GeneratedRegex]</code>, logging, and DI to replace reflection with generated code → faster startup, trimming/AOT friendly, and debuggable.</li>
<li>Contrast: reflection is runtime, slow, and AOT-hostile; source generation is compile-time and fast. (Different again from IL weaving, which rewrites IL post-compile.)</li>
</ul>
<div class="say"><strong>Say this:</strong> "A source generator runs at compile time, inspects the code, and emits extra C# that's compiled in — so there's no runtime reflection. System.Text.Json, GeneratedRegex and logging use it to replace reflection, giving faster startup and trim/AOT friendliness. Reflection is runtime and slow; source generation moves that work to compile time."</div>
`,

"clr-runtime-gc__assemblies-assemblyloadcontext-plugins-unload": `
<p class="lead">An assembly (.dll/.exe) is the unit of deployment and versioning: IL + metadata + a manifest (identity, version, dependencies). <strong>AssemblyLoadContext</strong> loads assemblies in isolation at runtime, and a <em>collectible</em> ALC can be unloaded.</p>
<h2>Why it matters</h2>
<p>A collectible ALC is the basis for plugin systems and hot-reload: load a plugin into its own context, use it, then unload to reclaim its memory and allow a new version in.</p>
<div class="warn"><strong>Gotcha:</strong> any lingering reference <em>into</em> the plugin (an event subscription, a cached delegate, a static holding one of its types) pins its ALC and prevents unloading — a classic plugin memory leak.</div>
<div class="say"><strong>Say this:</strong> "An assembly is the unit of deployment and versioning — IL, metadata and a manifest. AssemblyLoadContext loads assemblies in isolation, and a collectible ALC can be unloaded, which is how plugin systems and hot-reload work: load a plugin into its own context, then unload to reclaim memory. The classic leak is a lingering reference into the plugin pinning its ALC so it never unloads."</div>
`,

"collections-linq__list-vs-array-the-resizing-cost": `
<p class="lead"><strong>Array</strong>: fixed size, contiguous, fastest index access, no resizing. <strong>List&lt;T&gt;</strong>: a dynamic array that grows by <em>doubling</em> its backing array when full — amortized O(1) add, but each resize allocates a new array and copies everything.</p>
<p>Both are O(1) index, O(n) search and middle-insert. If you know the count, pre-size with <code>new List&lt;T&gt;(capacity)</code> to avoid repeated resize-and-copy.</p>
<div class="say"><strong>Say this:</strong> "An array is fixed-size and contiguous with the fastest indexing; List&lt;T&gt; is a dynamic array that doubles its backing array when full — amortized O(1) add, but each growth reallocates and copies. Both are O(1) index, O(n) search and middle-insert. If I know the count I pre-size the list to skip the resizes."</div>
`,

"collections-linq__big-o-of-the-common-net-collections": `
<p class="lead">Pick the collection by the complexity of the operation you do most.</p>
<table>
<tr><th>Collection</th><th>Lookup</th><th>Add</th><th>Remove</th></tr>
<tr><td>List&lt;T&gt; / array</td><td>O(1) index, O(n) search</td><td>O(1) end (amortized)</td><td>O(n) middle</td></tr>
<tr><td>Dictionary / HashSet</td><td>O(1) avg, O(n) worst</td><td>O(1) avg</td><td>O(1) avg</td></tr>
<tr><td>SortedDictionary (tree)</td><td>O(log n)</td><td>O(log n)</td><td>O(log n)</td></tr>
<tr><td>SortedList (array)</td><td>O(log n)</td><td>O(n)</td><td>O(n)</td></tr>
<tr><td>LinkedList</td><td>O(n)</td><td>O(1) at node</td><td>O(1) at node</td></tr>
<tr><td>Queue / Stack</td><td>—</td><td>O(1)</td><td>O(1)</td></tr>
<tr><td>PriorityQueue</td><td>O(1) peek</td><td>O(log n)</td><td>O(log n)</td></tr>
</table>
<div class="say"><strong>Say this:</strong> "List/array are O(1) index but O(n) search; Dictionary and HashSet are O(1) average lookup, O(n) worst under collisions; SortedDictionary is O(log n) via a tree; Queue/Stack are O(1); PriorityQueue is O(log n). I pick by the dominant operation — membership goes to a hash set, ordered range queries to a sorted structure."</div>
`,

"collections-linq__dictionary-hashing-collision-handling": `
<p class="lead"><code>Dictionary&lt;K,V&gt;</code> is a hash table: it computes <code>GetHashCode(key)</code>, maps it to a bucket, and on collision <em>chains</em> entries in that bucket. Lookup is O(1) average, O(n) worst when many keys hash to the same bucket.</p>
<ul>
<li>A good <code>GetHashCode</code> spreads keys across buckets; a bad one (everything to one bucket) degrades to O(n).</li>
<li>Equal keys <strong>must</strong> have equal hash codes, and a key must be <strong>immutable while in use</strong> — mutating a hash-relevant field moves its bucket and you "lose" it.</li>
<li>It resizes (rehashes all entries) when the load factor is exceeded.</li>
</ul>
<div class="say"><strong>Say this:</strong> "A Dictionary is a hash table — it hashes the key to a bucket and chains on collision, so lookup is O(1) average but O(n) if hashes collide badly. That's why GetHashCode must distribute well, equal keys must hash equally, and a key must stay immutable while it's in the dictionary — mutating a hash-relevant field loses it."</div>
`,

"collections-linq__hashset-vs-list-for-membership-set-operations": `
<p class="lead"><code>List.Contains</code> is an O(n) linear scan; <code>HashSet.Contains</code> is O(1) average. For membership tests and dedup, use a <code>HashSet&lt;T&gt;</code> — which also gives set operations: <code>UnionWith</code>, <code>IntersectWith</code>, <code>ExceptWith</code>.</p>
<div class="warn"><strong>Classic O(n²) bug:</strong> checking "have I already seen this?" against a <code>List</code> inside a loop. Swap the List for a HashSet and it drops to O(n).</div>
<div class="say"><strong>Say this:</strong> "List.Contains is an O(n) scan; HashSet.Contains is O(1) average. For membership and dedup I use a HashSet, and I get set operations like IntersectWith and ExceptWith for free. The classic bug is a 'have I seen this?' check against a List in a loop — that's O(n²); a HashSet makes it O(n)."</div>
`,

"collections-linq__sorteddictionary-vs-sortedlist-vs-dictionary": `
<p class="lead">All three map keys to values; they differ in ordering and operation cost.</p>
<ul>
<li><strong>Dictionary:</strong> hash table, <em>unordered</em>, O(1) lookup. The default when you don't need order.</li>
<li><strong>SortedDictionary:</strong> a red-black tree, keys kept sorted, O(log n) for everything — best when you insert/remove often and need order.</li>
<li><strong>SortedList:</strong> a sorted array of key/value pairs — O(log n) lookup (binary search) but O(n) insert/remove (shifting). Lower memory and fast by-index access — best when it's built once and mostly read.</li>
</ul>
<div class="say"><strong>Say this:</strong> "Dictionary is an unordered hash table with O(1) lookup. When I need sorted keys I use SortedDictionary — a tree, O(log n) everything, good for frequent inserts — or SortedList, a sorted array with O(log n) lookup but O(n) insert; SortedList uses less memory and is better when it's built once and mostly read."</div>
`,

"collections-linq__priorityqueue-what-when": `
<p class="lead"><code>PriorityQueue&lt;TElement,TPriority&gt;</code> (.NET 6+) is a binary <strong>min-heap</strong>: you <code>Enqueue</code> an item with a priority and <code>Dequeue</code> returns the lowest-priority value first. Enqueue/Dequeue are O(log n), Peek is O(1).</p>
<h2>Use for</h2>
<p>Schedulers ("process the most urgent first"), shortest-path algorithms (Dijkstra/A*), and bounded top-k.</p>
<div class="warn"><strong>Two caveats:</strong> it is <em>not stable</em> (equal priorities aren't FIFO) and it is <em>not thread-safe</em>.</div>
<div class="say"><strong>Say this:</strong> "PriorityQueue is a binary min-heap — enqueue with a priority, dequeue the most urgent in O(log n). I use it for scheduling, shortest-path, and top-k. Two caveats: it's not stable for equal priorities and it's not thread-safe."</div>
`,

"collections-linq__the-concurrent-collections-which-when": `
<p class="lead">The <code>System.Collections.Concurrent</code> types give thread-safe access without manual locking.</p>
<ul>
<li><strong>ConcurrentDictionary&lt;K,V&gt;:</strong> thread-safe map with fine-grained locking; <code>GetOrAdd</code>/<code>AddOrUpdate</code>.</li>
<li><strong>ConcurrentQueue / ConcurrentStack:</strong> lock-free FIFO / LIFO.</li>
<li><strong>ConcurrentBag:</strong> unordered, optimized for threads that add and take their own items.</li>
<li><strong>BlockingCollection&lt;T&gt;:</strong> producer/consumer with blocking and bounding (backpressure) — the older synchronous counterpart to Channels.</li>
</ul>
<p>Prefer these over hand-rolled locks for shared collections; prefer <code>System.Threading.Channels</code> for <em>async</em> producer/consumer.</p>
<div class="say"><strong>Say this:</strong> "For shared state across threads I use the concurrent collections: ConcurrentDictionary for a thread-safe map, ConcurrentQueue/Stack for lock-free FIFO/LIFO, ConcurrentBag for same-thread-heavy workloads, and BlockingCollection for bounded producer/consumer. For async producer/consumer I use Channels instead."</div>
`,

"collections-linq__concurrentdictionary-the-getoradd-factory-gotcha": `
<p class="lead"><code>ConcurrentDictionary</code> is thread-safe with fine-grained locking, and <code>GetOrAdd</code>/<code>AddOrUpdate</code> are atomic <em>with respect to the dictionary</em>. But the <strong>value factory can run more than once</strong> under contention.</p>
<p>If two threads miss the same key at once, both may invoke the factory; only one result is stored, the other is discarded. So the factory must be <strong>side-effect-free and cheap</strong>.</p>
<pre><code>// if the value is expensive or must be a singleton, store a Lazy:
var cache = new ConcurrentDictionary&lt;string, Lazy&lt;Conn&gt;&gt;();
var conn = cache.GetOrAdd(key, k =&gt; new Lazy&lt;Conn&gt;(() =&gt; Create(k))).Value;
// GetOrAdd may create two Lazy wrappers, but only the winner's .Value ever runs</code></pre>
<div class="say"><strong>Say this:</strong> "ConcurrentDictionary is thread-safe, but the GetOrAdd value factory can run more than once under contention — two threads both miss and both invoke it, though only one value is kept. So the factory must be side-effect-free. If creating the value is expensive or must be a singleton, I store a Lazy&lt;T&gt; so the factory runs exactly once."</div>
`,

"collections-linq__immutable-frozen-collections": `
<p class="lead">Two families for read-heavy and shared state.</p>
<ul>
<li><strong>Immutable collections</strong> (<code>ImmutableList</code>, <code>ImmutableDictionary</code>…): can't be mutated; an "add" returns a <em>new</em> collection that shares structure with the old one. Inherently thread-safe and great for snapshots — the cost is an allocation per change.</li>
<li><strong>Frozen collections</strong> (<code>FrozenDictionary</code>, <code>FrozenSet</code>, .NET 8): built once, then read-only and heavily optimized for <em>fast reads</em> — ideal for a lookup table built at startup and read millions of times.</li>
</ul>
<div class="say"><strong>Say this:</strong> "Immutable collections can't be mutated — an add returns a new collection that shares structure — so they're inherently thread-safe and great for snapshots, at the cost of allocation on change. Frozen collections are built once then read-only with heavily optimized reads — perfect for a lookup table I build at startup and read constantly."</div>
`,

"collections-linq__collection-interfaces-ienumerable-icollection-ilist-ireadonly": `
<p class="lead">The collection interfaces form a capability ladder — accept the least capable one you need, return the most useful.</p>
<table>
<tr><td><code>IEnumerable&lt;T&gt;</code></td><td>iterate (foreach) — the most abstract</td></tr>
<tr><td><code>IReadOnlyCollection&lt;T&gt;</code></td><td>+ Count</td></tr>
<tr><td><code>IReadOnlyList&lt;T&gt;</code></td><td>+ indexer (read-only)</td></tr>
<tr><td><code>ICollection&lt;T&gt;</code></td><td>+ Add/Remove/Contains (mutable)</td></tr>
<tr><td><code>IList&lt;T&gt;</code></td><td>+ insert/remove by index</td></tr>
</table>
<p>Accept <code>IEnumerable&lt;T&gt;</code> when you only iterate; return <code>IReadOnlyList&lt;T&gt;</code> to expose data without letting callers mutate it.</p>
<div class="warn"><strong>Watch out:</strong> returning a raw <code>IEnumerable&lt;T&gt;</code> that is actually a deferred query lets callers enumerate it twice and re-run the work — materialize first.</div>
<div class="say"><strong>Say this:</strong> "I accept the least capable interface I need and return the most useful — IEnumerable for iterate-once, IReadOnlyList to expose data without mutation, ICollection/IList when they need to add or index. I avoid returning a raw IEnumerable that's secretly a deferred query, because callers can enumerate it twice."</div>
`,

"collections-linq__using-a-custom-type-as-a-dictionary-key": `
<p class="lead">To use a type as a <code>Dictionary</code>/<code>HashSet</code> key it must have correct <code>Equals</code> + <code>GetHashCode</code> (value equality) <em>and</em> be immutable in its hash-relevant fields while it's a key.</p>
<p>A plain <code>class</code> without overrides uses <em>reference</em> equality — two value-equal objects become different keys. The clean fix is a <code>record</code> (auto-generated value equality and hashing) or a well-written <code>struct</code>, kept immutable.</p>
<pre><code>record CustomerKey(Guid TenantId, string Code);   // value equality + hashing, immutable</code></pre>
<div class="say"><strong>Say this:</strong> "A dictionary key needs correct, consistent Equals and GetHashCode giving value equality, and its hash-relevant fields must not change while it's a key. A plain class uses reference equality, so two value-equal objects are different keys — I make the key a record, which generates value equality and hashing, and keep it immutable."</div>
`,

"collections-linq__deferred-vs-immediate-execution": `
<p class="lead">Most LINQ operators are <strong>deferred</strong>: <code>Where</code>, <code>Select</code>, <code>OrderBy</code> build a query but don't run until you enumerate it. <strong>Immediate</strong> (materializing) operators — <code>ToList</code>, <code>ToArray</code>, <code>Count</code>, <code>First</code>, <code>Sum</code> — execute now.</p>
<p>So a deferred query runs at enumeration time against the <em>current</em> data, composing is free, and re-enumerating re-runs the whole pipeline. Call <code>ToList()</code> to execute once and snapshot.</p>
<div class="say"><strong>Say this:</strong> "LINQ is mostly deferred — Where/Select build a pipeline that doesn't run until you enumerate it; ToList/Count/First force immediate execution. So the query runs at enumeration against current data, composing is cheap, and re-enumerating re-runs everything. I call ToList to execute once and snapshot."</div>
`,

"collections-linq__the-multiple-enumeration-pitfall": `
<p class="lead">Enumerating a deferred <code>IEnumerable</code> more than once <strong>re-executes the whole pipeline</strong> each time — and if it's an EF <code>IQueryable</code>, it re-queries the database.</p>
<pre><code>var q = items.Where(Expensive);   // deferred
if (q.Any()) {                     // runs the pipeline once
    foreach (var x in q) {...}      // runs it AGAIN
}
// fix: materialize once
var list = items.Where(Expensive).ToList();</code></pre>
<p>Analyzers flag this as "possible multiple enumeration of IEnumerable".</p>
<div class="say"><strong>Say this:</strong> "Enumerating a deferred sequence twice re-runs the whole pipeline — and for an EF query, hits the database again. The classic is calling Any() then foreach-ing the same query. I materialize once with ToList and reuse it; analyzers flag exactly this."</div>
`,

"collections-linq__ienumerable-vs-iqueryable-where-the-query-runs": `
<p class="lead"><code>IEnumerable&lt;T&gt;</code> executes <strong>in-process</strong> (LINQ-to-Objects) — data is pulled into memory and filtered in C#. <code>IQueryable&lt;T&gt;</code> builds an <strong>expression tree</strong> the provider (EF Core) translates to SQL, so filtering and paging run <em>in the database</em>.</p>
<div class="warn"><strong>The trap:</strong> calling <code>.ToList()</code> too early — or using a method EF can't translate — switches from IQueryable to IEnumerable, so the filter runs client-side over the whole table (client-side evaluation), pulling far more data than needed.</div>
<div class="say"><strong>Say this:</strong> "IEnumerable runs in-process — it pulls data into memory and filters in C#. IQueryable builds an expression tree the provider turns into SQL, so filtering and paging happen in the database. The classic bug is materializing too early with ToList, or using an untranslatable method, which drops to client-side evaluation and filters the whole table in memory."</div>
`,

"collections-linq__ienumerable-vs-iqueryable-vs-iasyncenumerable": `
<p class="lead">Three LINQ-shaped abstractions with very different execution.</p>
<ul>
<li><strong>IEnumerable&lt;T&gt;:</strong> in-memory, lazy, <em>synchronous</em> iteration (LINQ-to-Objects).</li>
<li><strong>IQueryable&lt;T&gt;:</strong> an expression tree the provider translates to SQL — filtering/paging compose into the database query.</li>
<li><strong>IAsyncEnumerable&lt;T&gt;:</strong> asynchronous <em>streaming</em> via <code>await foreach</code> — items arrive one at a time without buffering the whole set. Great for large result sets, streaming APIs, and gRPC server streaming.</li>
</ul>
<div class="say"><strong>Say this:</strong> "IEnumerable is in-memory synchronous iteration; IQueryable is an expression tree the provider turns into SQL so the query runs in the database; IAsyncEnumerable is async streaming with await foreach, where items arrive one at a time without buffering — ideal for large result sets and streaming endpoints."</div>
`,

"collections-linq__expression-trees-how-iqueryable-becomes-sql": `
<p class="lead">An <strong>expression tree</strong> is code-as-data — a tree representing a lambda rather than compiled IL. It's how <code>IQueryable</code> becomes SQL.</p>
<p>When you write <code>Where(x =&gt; x.Age &gt; 18)</code> on an <code>IQueryable</code>, the lambda is captured as <code>Expression&lt;Func&lt;T,bool&gt;&gt;</code>; EF's provider walks that tree and emits SQL. A plain <code>Func&lt;&gt;</code> (a compiled delegate) is opaque and can't be inspected, so LINQ-to-Objects can't translate it — which is exactly why <code>IQueryable</code> takes <code>Expression</code> and <code>IEnumerable</code> takes <code>Func</code>.</p>
<div class="say"><strong>Say this:</strong> "An expression tree is code represented as data — the lambda as an inspectable tree, not compiled IL. EF captures the Where predicate as an Expression&lt;Func&gt;, walks the tree, and generates SQL. A plain Func is opaque and can't be translated, which is why IQueryable takes Expression and IEnumerable takes Func."</div>
`,

"collections-linq__streaming-vs-buffering-operators": `
<p class="lead">LINQ operators split into streaming and buffering, which changes memory use and ordering decisions.</p>
<ul>
<li><strong>Streaming</strong> (<code>Where</code>, <code>Select</code>, <code>Take</code>): yield items as they go — constant memory, start producing immediately.</li>
<li><strong>Buffering</strong> (<code>OrderBy</code>, <code>GroupBy</code>, <code>Reverse</code>): must consume the <em>entire</em> input before producing any output, so they materialize internally.</li>
</ul>
<p>Order matters: put <code>Where</code> before <code>OrderBy</code> so you sort fewer items. A <code>Take</code> after an <code>OrderBy</code> still has to sort everything first.</p>
<div class="say"><strong>Say this:</strong> "Streaming operators like Where/Select/Take produce items as they go in constant memory; buffering operators like OrderBy/GroupBy/Reverse read the whole input first. So I filter before I sort — Where before OrderBy — and I know a Take after an OrderBy still sorts everything."</div>
`,

"collections-linq__groupby-join-selectmany-semantics-cost": `
<p class="lead">Three heavyweight operators worth understanding.</p>
<ul>
<li><strong>GroupBy:</strong> buffers the input into groups by a key selector — O(n), allocates the groups.</li>
<li><strong>Join:</strong> inner join on a key; builds a hash lookup of the inner sequence, so it's O(n + m). <code>GroupJoin</code> gives a left-join shape.</li>
<li><strong>SelectMany:</strong> flattens — projects each element to a sequence and concatenates (one-to-many). Powerful, but can explode into a cartesian product.</li>
</ul>
<p>In EF these translate to SQL <code>GROUP BY</code>/<code>JOIN</code>; in LINQ-to-Objects they run in memory.</p>
<div class="say"><strong>Say this:</strong> "GroupBy buffers into groups, Join does a hash join on a key in O(n+m), and SelectMany flattens one-to-many — useful but it can blow up into a cartesian product. In EF these become SQL GROUP BY and JOIN; in memory they run in-process. I watch for SelectMany exploding and GroupBy buffering a large set."</div>
`,

"collections-linq__query-syntax-vs-method-syntax": `
<p class="lead">Two equivalent LINQ styles — query syntax compiles down to the method calls.</p>
<ul>
<li><strong>Query syntax</strong> (<code>from x in xs where ... select ...</code>): SQL-like, reads well for joins, group-by, and <code>let</code>.</li>
<li><strong>Method syntax</strong> (<code>xs.Where(...).Select(...)</code>): the underlying API, and the only way to call operators query syntax lacks — <code>ToList</code>, <code>Count</code>, <code>Skip</code>/<code>Take</code>, etc.</li>
</ul>
<p>Pick for readability and mix the two freely.</p>
<div class="say"><strong>Say this:</strong> "Query and method syntax are equivalent — query syntax compiles to the method calls. Query syntax reads nicely for joins, group-by and let; method syntax is the full API and the only way to reach operators like ToList, Count or Skip/Take. I pick whichever is clearer and mix them."</div>
`,

"collections-linq__yield-iterator-mechanics": `
<p class="lead"><code>yield return</code> builds a lazy iterator — the compiler generates a state machine (an <code>IEnumerator</code>) that resumes at each <code>yield</code> on <code>MoveNext</code>. This is the engine behind custom streaming LINQ operators.</p>
<pre><code>IEnumerable&lt;T&gt; TakeWhilePositive&lt;T&gt;(IEnumerable&lt;int&gt; src) {
    foreach (var n in src) { if (n &lt;= 0) yield break; yield return n; }
}</code></pre>
<div class="warn"><strong>Gotchas:</strong> it's deferred, so enumerating twice re-runs it; argument validation doesn't fire until the first <code>MoveNext</code> (split the method to validate eagerly); and you can't <code>yield</code> inside a <code>try</code> that has a <code>catch</code> (only <code>try/finally</code>).</div>
<div class="say"><strong>Say this:</strong> "yield return builds a lazy iterator — the compiler emits a state machine that resumes at each yield on MoveNext, which is how streaming LINQ operators work. It's deferred, so enumerating twice re-runs it, and argument validation needs a wrapper method because the body doesn't run until the first MoveNext."</div>
`,

"collections-linq__the-closure-captured-variable-pitfall-in-loops": `
<p class="lead">A closure captures a variable <em>by reference</em>, not by value. Capturing a loop variable in a lambda or <code>Task</code> and running it later can make them all see the <strong>final</strong> value.</p>
<pre><code>// for-loop variable is shared -> all tasks print the final i
for (int i = 0; i &lt; 3; i++) tasks.Add(Task.Run(() =&gt; Console.Write(i)));
// fix: copy to a per-iteration local
for (int i = 0; i &lt; 3; i++) { int local = i; tasks.Add(Task.Run(() =&gt; Console.Write(local))); }</code></pre>
<p>The <code>foreach</code> variable is per-iteration (fixed since C# 5), but a <code>for</code> loop variable is shared — so copy it to a local inside the body and capture that.</p>
<div class="say"><strong>Say this:</strong> "Closures capture by reference, not value. In a for loop, lambdas or Tasks that capture the loop variable all see its final value because it's shared. The foreach variable is per-iteration since C# 5, but for a for loop I copy to a local inside the body and capture that. It bites hardest with deferred execution and parallel tasks."</div>
`,

"collections-linq__common-linq-performance-pitfalls": `
<p class="lead">The recurring LINQ performance traps:</p>
<ul>
<li><strong>Multiple enumeration</strong> — re-running the pipeline / re-querying.</li>
<li><strong>Materializing too early</strong> (<code>ToList</code> then LINQ in memory) — loses SQL translation; or triggers client-side evaluation.</li>
<li><strong>EF N+1</strong> — touching a navigation inside a loop; fix with <code>Include</code> or a projection.</li>
<li><strong>Count() &gt; 0 instead of Any()</strong> when you only need existence.</li>
<li><strong>OrderBy before Where</strong> — sorting more than you keep.</li>
<li><strong>Selecting whole entities</strong> when a projection to a DTO would pull far fewer columns.</li>
</ul>
<p>On measured hot paths, a plain loop sometimes beats LINQ's delegate and allocation overhead.</p>
<div class="say"><strong>Say this:</strong> "The big ones: multiple enumeration re-running the query, materializing too early so it filters in memory or triggers client-side evaluation, EF N+1 from touching navigations in a loop, Count&gt;0 instead of Any, sorting before filtering, and selecting whole entities when a projection would do. On hot paths a plain loop sometimes wins."</div>
`,

"collections-linq__delegates-func-action-predicate-powering-linq": `
<p class="lead">LINQ-to-Objects operators are higher-order functions that take <strong>delegates</strong>: <code>Where</code> takes <code>Func&lt;T,bool&gt;</code> (a predicate), <code>Select</code> takes <code>Func&lt;T,TResult&gt;</code>, and so on. Your lambda becomes a compiled delegate invoked per element.</p>
<p><code>IQueryable</code> operators instead take <code>Expression&lt;Func&lt;...&gt;&gt;</code> — the inspectable tree — so providers can translate them. So the same lambda syntax means a <em>compiled delegate</em> for <code>IEnumerable</code> and an <em>expression tree</em> for <code>IQueryable</code> — the key difference between the two.</p>
<div class="say"><strong>Say this:</strong> "LINQ-to-Objects operators take delegates — Where a Func&lt;T,bool&gt;, Select a Func&lt;T,TResult&gt; — and the lambda becomes a compiled delegate invoked per element. IQueryable takes Expression&lt;Func&gt; instead so the provider can translate it. Same lambda syntax, but a compiled delegate for IEnumerable and an expression tree for IQueryable."</div>
`,

"async-multithreading-resilience__task-vs-valuetask-why-valuetask-exists": `
<p class="lead"><code>Task</code> is a reference type — every async method returning one allocates, even when it completes synchronously. <code>ValueTask</code> can wrap either a synchronous result or a <code>Task</code>, avoiding the allocation when the result is already available (e.g. a cache hit) — but it comes with strict usage rules.</p>
<div class="warn"><strong>ValueTask rules:</strong> await it <em>once</em>; never store it, await it twice, pass it to <code>WhenAll</code> directly, or block on it. If you need any of those, call <code>.AsTask()</code> first.</div>
<p>Default to <code>Task</code>; reach for <code>ValueTask</code> only on hot paths that often complete synchronously and where profiling shows the allocation matters. Premature <code>ValueTask</code> is a bug magnet.</p>
<div class="say"><strong>Say this:</strong> "Task is a reference type, so every async method that returns one allocates even when it completes synchronously; ValueTask avoids that when the result is already there, like a cache hit. But a ValueTask must be awaited exactly once and never stored, awaited twice, or blocked on — otherwise call AsTask. I default to Task and use ValueTask only where profiling shows it matters."</div>
`,

"async-multithreading-resilience__async-await-under-the-hood-state-machine": `
<p class="lead">The compiler rewrites an <code>async</code> method into a <strong>state machine</strong>. Each <code>await</code> is a state.</p>
<ul>
<li>If the awaited task is <em>already complete</em>, execution continues synchronously (no suspension).</li>
<li>If not, the method <strong>returns to its caller</strong>, registering a continuation — <em>no thread is blocked</em> while the I/O is in flight.</li>
<li>When the task completes, the continuation resumes at the saved state — on the captured <code>SynchronizationContext</code> unless you used <code>ConfigureAwait(false)</code>.</li>
</ul>
<p>The <code>Task</code>/<code>ValueTask</code> you return is the handle to the eventual result. This is why async scales: a few threads serve thousands of in-flight I/O operations.</p>
<div class="say"><strong>Say this:</strong> "The compiler turns an async method into a state machine where each await is a resumption point. If the task is already done it continues synchronously; otherwise the method returns to its caller and registers a continuation — no thread is parked during the I/O — and resumes at the saved state when the task completes. That's why async scales: a handful of threads serve thousands of in-flight operations."</div>
`,

"async-multithreading-resilience__task-whenall-vs-whenany-vs-parallel-foreachasync": `
<p class="lead">Three tools for running work concurrently — chosen by whether the work is I/O-bound and whether you must bound concurrency.</p>
<ul>
<li><strong>Task.WhenAll</strong> — run a bounded, known set of async operations concurrently and await them all. No degree-of-parallelism control; it starts them all at once.</li>
<li><strong>Task.WhenAny</strong> — completes when the <em>first</em> finishes. Use for timeouts/races ("whichever responds first") or to process results as they arrive.</li>
<li><strong>Parallel.ForEachAsync</strong> (.NET 6+) — run async work over a collection with a <code>MaxDegreeOfParallelism</code>. Use when the set is large and you must <em>bound</em> concurrency (don't open 10,000 sockets at once).</li>
</ul>
<div class="warn"><strong>Don't confuse</strong> <code>Parallel.For</code>/<code>ForEach</code> (no async suffix) — that's for CPU-bound work across cores, not for awaiting I/O. Blocking inside <code>Parallel.For</code> is a classic mistake.</div>
<div class="say"><strong>Say this:</strong> "WhenAll runs a known set of async operations concurrently and awaits all; WhenAny completes on the first, for timeouts and races; Parallel.ForEachAsync runs async work over a large collection with a bounded degree of parallelism. The axis: I/O-bound is async with WhenAll or ForEachAsync, CPU-bound is Parallel.For or PLINQ — blocking inside Parallel.For is the classic mix-up."</div>
`,

"async-multithreading-resilience__whenall-with-exceptions-aggregateexception": `
<p class="lead">If several tasks in a <code>WhenAll</code> throw, <strong>all of them still run to completion</strong> — <code>WhenAll</code> doesn't cancel the others. When you <code>await</code> it, it throws, but <code>await</code> only rethrows the <em>first</em> exception.</p>
<p>The other exceptions aren't lost — the returned task's <code>.Exception</code> is an <code>AggregateException</code> holding them all.</p>
<pre><code>var all = Task.WhenAll(tasks);
try { await all; }
catch {
    foreach (var ex in all.Exception.InnerExceptions)
        _log.LogError(ex, "task failed");       // see every failure
}</code></pre>
<p>For per-item outcomes (which succeeded, which failed), don't rely on the throw — wrap each task to return a result object and inspect them all.</p>
<div class="say"><strong>Say this:</strong> "All the tasks still run — WhenAll doesn't cancel the rest. Awaiting it throws, but await only surfaces the first exception; the others are on the task's AggregateException. So to log them all I inspect the aggregated exception, and if I need per-item success/failure I wrap each task to return a result. Nothing is cancelled unless I wire a linked token."</div>
`,

"async-multithreading-resilience__lock-vs-interlocked-vs-concurrentdictionary": `
<p class="lead">Three tools for shared mutable state, from coarse to fine.</p>
<ul>
<li><strong>lock (Monitor):</strong> mutual exclusion around a critical section. Simple; the cost is contention and deadlock risk if you take multiple locks in an inconsistent order. <strong>Never <code>await</code> inside a <code>lock</code>.</strong></li>
<li><strong>Interlocked:</strong> lock-free atomic operations on a single value (<code>Increment</code>, <code>CompareExchange</code>). Fastest for counters/flags; no blocking.</li>
<li><strong>ConcurrentDictionary:</strong> thread-safe map with fine-grained locking (but the <code>GetOrAdd</code> factory can run more than once).</li>
</ul>
<p>For <em>async</em> mutual exclusion use <code>SemaphoreSlim(1,1)</code>, not <code>lock</code> — a lock can't span an <code>await</code>.</p>
<div class="say"><strong>Say this:</strong> "lock gives mutual exclusion around a critical section — simple, but watch contention and deadlock, and never await inside it. Interlocked is lock-free atomics for a single value like a counter — fastest, no blocking. ConcurrentDictionary is a thread-safe map. And for async mutual exclusion I use SemaphoreSlim(1,1), because a lock can't span an await."</div>
`,

"async-multithreading-resilience__volatile-interlocked-memory-barriers": `
<p class="lead">Without synchronization, the compiler and CPU may <strong>reorder instructions and cache values per core</strong>, so one thread may never see another thread's write — a bug that's invisible on your machine and strikes in production under load.</p>
<ul>
<li><strong>volatile:</strong> prevents caching/reordering across the access (acquire/release semantics) — ensures <em>visibility</em>, not atomicity of compound operations (<code>volatile x++</code> is still a race).</li>
<li><strong>Interlocked:</strong> atomic read-modify-write (<code>Increment</code>, <code>CompareExchange</code>) with a full fence.</li>
</ul>
<p>Prefer higher-level primitives (<code>lock</code>, the concurrent collections, <code>Channel</code>) over hand-rolled <code>volatile</code> — the low-level memory model is where experts get it wrong.</p>
<div class="say"><strong>Say this:</strong> "Without synchronization the CPU and compiler can reorder and cache per core, so a thread may never see another's write — invisible locally, deadly under load. volatile guarantees visibility and ordering but not atomicity, so volatile x++ is still a race. Interlocked gives atomic read-modify-write with a full fence. I prefer lock, concurrent collections and channels over hand-rolled volatile."</div>
`,

"async-multithreading-resilience__async-await-causing-threadpool-starvation-diagnose": `
<p class="lead">async/await frees the thread while awaiting I/O — that's the whole point; a handful of threads serve thousands of concurrent requests. <strong>Sync-over-async breaks it.</strong></p>
<h2>What goes wrong</h2>
<p>Calling <code>.Result</code>, <code>.Wait()</code>, or <code>GetAwaiter().GetResult()</code> blocks a pool thread while the async op runs. Under load every request blocks a thread; the pool grows only slowly (about one thread per 500ms), request latency explodes, and you see <strong>timeouts that look like the DB or Redis is slow when it isn't</strong>.</p>
<h2>Diagnose &amp; fix</h2>
<p>Go async all the way down — never block on async; add <code>ConfigureAwait(false)</code> in libraries. Diagnose with thread-pool metrics (queue length, thread count climbing), <code>dotnet-counters</code>/<code>dotnet-trace</code>, or a dump showing many threads parked in <code>Wait</code>.</p>
<div class="warn"><strong>The senior insight:</strong> the symptom (Redis/SQL timeouts) points away from the cause (client-side blocking). Knowing to look at the thread pool first is what separates a lead.</div>
<div class="say"><strong>Say this:</strong> "async frees the thread during I/O, so a few threads serve thousands of requests. Sync-over-async — .Result or .Wait() — blocks a pool thread; under load every request blocks one, the pool only grows about a thread every half-second, and you get timeouts that look like Redis or SQL is slow when it's actually client-side starvation. I diagnose with thread-pool counters and a dump of threads parked in Wait, and fix by going async all the way down."</div>
`,

"async-multithreading-resilience__configureawait-false-the-sync-over-async-deadlock": `
<p class="lead">By default <code>await</code> captures the current <code>SynchronizationContext</code> and resumes the continuation on it. In classic ASP.NET and UI apps that context is effectively single-threaded.</p>
<h2>The deadlock</h2>
<p>If you then <em>block</em> on the async call (<code>.Result</code>, <code>.Wait()</code>), the one context thread is stuck waiting — but the continuation needs that same thread to resume. Neither proceeds: <strong>deadlock</strong>. It's the number-one sync-over-async bug.</p>
<h2>The fix</h2>
<p>In library code, <code>ConfigureAwait(false)</code> resumes on any thread-pool thread, not the captured context — breaking the deadlock and avoiding needless context hops. The real fix is to <strong>never block on async</strong>.</p>
<div class="warn"><strong>Nuance:</strong> ASP.NET Core has no SynchronizationContext, so the deadlock can't happen there and <code>ConfigureAwait(false)</code> is a micro-optimization — but keep the habit in shared libraries that might run under a context (desktop, classic ASP.NET).</div>
<div class="say"><strong>Say this:</strong> "await captures the sync context and resumes on it; in classic ASP.NET or UI that context is single-threaded, so if you block on the call the one thread waits while the continuation needs that same thread — deadlock. ConfigureAwait(false) resumes on any pool thread and breaks it, but the real fix is never blocking on async. ASP.NET Core has no sync context so the deadlock's gone, yet I still ConfigureAwait(false) in libraries."</div>
`,

"async-multithreading-resilience__cancellationtoken-linking-timeouts-propagation": `
<p class="lead">A <code>CancellationToken</code> is <strong>cooperative</strong> — code must observe it. Nothing cancels unless you thread the token through and check it.</p>
<pre><code>// timeout as cancellation
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

// combine the request's token with the timeout
using var linked = CancellationTokenSource.CreateLinkedTokenSource(requestCt, cts.Token);
await CallAsync(linked.Token);</code></pre>
<ul>
<li>Pass the token into <em>every</em> async call down the chain (DB, HTTP, gRPC).</li>
<li>Check <code>ThrowIfCancellationRequested()</code> in long loops.</li>
<li>Always dispose the CTS (<code>using</code>) to free its timer.</li>
</ul>
<div class="say"><strong>Say this:</strong> "Cancellation is cooperative — the code has to observe the token. I model a timeout as a CancellationTokenSource with a delay, link the request's token with the timeout via CreateLinkedTokenSource, and thread the token through every downstream call, checking it in long loops. A token I don't propagate is just decoration — the work keeps running — so threading it end-to-end is the whole point."</div>
`,

"async-multithreading-resilience__limit-concurrent-external-calls-to-n-semaphoreslim": `
<p class="lead">Bound concurrency with a <code>SemaphoreSlim</code> (the async gate) or <code>Parallel.ForEachAsync</code> with <code>MaxDegreeOfParallelism</code>.</p>
<pre><code>var gate = new SemaphoreSlim(20);
var tasks = items.Select(async item =&gt; {
    await gate.WaitAsync(ct);
    try { return await CallAsync(item, ct); }
    finally { gate.Release(); }
});
var results = await Task.WhenAll(tasks);

// cleaner in .NET 6+:
await Parallel.ForEachAsync(items,
    new ParallelOptions { MaxDegreeOfParallelism = 20, CancellationToken = ct },
    async (item, token) =&gt; await CallAsync(item, token));</code></pre>
<p>For HTTP specifically, also cap at the transport: <code>HttpClientFactory</code> + <code>MaxConnectionsPerServer</code>, and reuse the client so you don't exhaust sockets.</p>
<div class="say"><strong>Say this:</strong> "To cap concurrency at N I gate with a SemaphoreSlim — await WaitAsync, Release in a finally — or use Parallel.ForEachAsync with MaxDegreeOfParallelism. For HTTP I also cap at the transport with HttpClientFactory and MaxConnectionsPerServer and reuse the client, because an unbounded Task.WhenAll over a big list is how you open ten thousand sockets at once."</div>
`,

"async-multithreading-resilience__system-threading-channels-producer-consumer-backpressure": `
<p class="lead"><code>Channel&lt;T&gt;</code> is a thread-safe async queue for the producer/consumer pattern — ideal for background processing, batching, and decoupling ingestion from work.</p>
<pre><code>var ch = Channel.CreateBounded&lt;Job&gt;(100);
// producer
await ch.Writer.WriteAsync(job, ct);
// consumer
await foreach (var job in ch.Reader.ReadAllAsync(ct))
    await ProcessAsync(job);</code></pre>
<p>A <strong>bounded</strong> channel gives <strong>backpressure</strong> — the writer awaits when the channel is full, so a fast producer can't exhaust memory. It's the async-first replacement for <code>BlockingCollection</code>.</p>
<div class="say"><strong>Say this:</strong> "Channel&lt;T&gt; is a thread-safe async producer/consumer queue — great for background work and smoothing bursts. A bounded channel gives backpressure: the writer awaits when it's full, so a fast producer can't blow up memory. It's the async-first replacement for BlockingCollection — a bounded channel plus a few consumer tasks is my go-to for bursty in-process load."</div>
`,

"async-multithreading-resilience__iasyncenumerable-streaming-cancellation": `
<p class="lead"><code>IAsyncEnumerable&lt;T&gt;</code> + <code>await foreach</code> streams items as they arrive instead of buffering the whole set — lower memory, faster first byte.</p>
<pre><code>async IAsyncEnumerable&lt;Row&gt; Read(
    [EnumeratorCancellation] CancellationToken ct = default) {
    await foreach (var r in _db.Rows.AsAsyncEnumerable().WithCancellation(ct))
        yield return r;
}</code></pre>
<p>The <code>[EnumeratorCancellation]</code> attribute flows the caller's token into the generated enumerator. EF Core, gRPC server streaming, and Channels all expose this shape.</p>
<div class="say"><strong>Say this:</strong> "IAsyncEnumerable with await foreach streams items as they arrive instead of buffering the whole set — lower memory, faster first byte. I mark the token parameter with [EnumeratorCancellation] so the caller's cancellation flows into the generated enumerator, and consume with WithCancellation. EF Core, gRPC server streaming and Channels all expose it."</div>
`,

"async-multithreading-resilience__deadlock-causes-prevention-coffman-conditions": `
<p class="lead">A deadlock is two or more threads each holding a lock the other needs, waiting forever. The <strong>four Coffman conditions</strong> must <em>all</em> hold: mutual exclusion, hold-and-wait, no preemption, and circular wait.</p>
<h2>Common triggers</h2>
<ul>
<li>Acquiring multiple locks in <em>inconsistent orders</em>.</li>
<li>Calling unknown/external code while holding a lock.</li>
<li>Blocking on async under a lock.</li>
</ul>
<h2>Prevention — break a condition</h2>
<p>Acquire locks in a consistent global order; use <code>TryEnter</code> with a timeout; keep critical sections tiny; prefer lock-free/concurrent collections; never <code>await</code> inside a lock. In databases: consistent access order, short transactions, and retry the deadlock victim.</p>
<div class="warn"><strong>Trade-off:</strong> fine-grained locking reduces contention but increases deadlock risk; one coarse lock is deadlock-free but serializes everything.</div>
<div class="say"><strong>Say this:</strong> "A deadlock is threads each holding a lock the other needs — all four Coffman conditions hold. The usual triggers are inconsistent lock ordering and calling external code or awaiting while holding a lock. I break a condition: acquire locks in one global order, TryEnter with a timeout, keep critical sections tiny, never await inside a lock. In the database it's consistent access order, short transactions, and retrying the victim."</div>
`,

"async-multithreading-resilience__race-vs-deadlock-vs-livelock-vs-starvation": `
<p class="lead">Four distinct concurrency failure modes with four distinct fixes.</p>
<ul>
<li><strong>Race condition:</strong> the result depends on the timing of unsynchronized access (lost updates, torn reads). Fix with synchronization or atomics.</li>
<li><strong>Deadlock:</strong> threads stuck waiting on each other — no progress, ever.</li>
<li><strong>Livelock:</strong> threads keep reacting to each other and changing state but make no progress (two people sidestepping in a hallway). Fix with randomized backoff.</li>
<li><strong>Starvation:</strong> a thread never gets the resource/CPU because others monopolize it. Fix with fairness/priorities.</li>
</ul>
<div class="say"><strong>Say this:</strong> "A race is when the outcome depends on unsynchronized timing — lost updates, torn reads. A deadlock is threads permanently waiting on each other. A livelock is threads busy reacting to each other but making no progress — fixed with randomized backoff. Starvation is a thread never getting its turn because others monopolize the resource — fixed with fairness. Different failure modes, different fixes."</div>
`,

"async-multithreading-resilience__when-parallelism-makes-things-slower": `
<p class="lead">More threads is not a performance strategy. Parallelism backfires when:</p>
<ul>
<li><strong>Overhead &gt; work:</strong> task scheduling and context switches cost more than small units of work.</li>
<li><strong>Contention:</strong> threads fighting over a lock or shared state serialize — <em>Amdahl's law</em>: the serial fraction caps your speedup no matter how many cores.</li>
<li><strong>False sharing:</strong> cores invalidate each other's cache line for unrelated variables that sit together.</li>
<li><strong>I/O-bound work:</strong> gets nothing from CPU parallelism — use async, not <code>Parallel.For</code>.</li>
</ul>
<p>Always measure.</p>
<div class="say"><strong>Say this:</strong> "Parallelism backfires when the overhead beats the work, when threads contend on a lock so Amdahl's serial fraction caps the speedup, when false sharing makes cores fight over a cache line, or when the work is I/O-bound and needs async not threads. So I measure first — more threads isn't a strategy for contended, tiny, or I/O-bound work."</div>
`,

"async-multithreading-resilience__retry-vs-timeout-vs-circuit-breaker": `
<p class="lead">Three resilience patterns that solve different failures and <strong>compose</strong>.</p>
<ul>
<li><strong>Timeout</strong> — give up on a single call after N seconds so you don't hang. The floor of all resilience.</li>
<li><strong>Retry</strong> — re-attempt a transient failure, with exponential backoff + jitter so you don't synchronize a retry storm. <em>Only for idempotent operations.</em></li>
<li><strong>Circuit breaker</strong> — after too many failures, stop calling the dependency for a cool-down (open), then test with one call (half-open), then resume (closed). Prevents hammering a dead service and lets it recover.</li>
</ul>
<p>They nest: timeout wraps each call, retry wraps the timeout, circuit breaker wraps the retries. In .NET this is Polly (or the built-in <code>Microsoft.Extensions.Http.Resilience</code>). Add <strong>bulkhead isolation</strong> so one slow dependency can't consume all threads.</p>
<div class="warn"><strong>Failure mode to name:</strong> retries <em>without</em> a circuit breaker turn a brief outage into a self-inflicted DDoS (a retry storm).</div>
<div class="say"><strong>Say this:</strong> "They compose: a timeout bounds each call, retry re-attempts transient failures with backoff and jitter — only for idempotent calls — and a circuit breaker stops calling a failing dependency for a cool-down then tests with one call. Timeout wraps the call, retry wraps the timeout, breaker wraps the retries, with bulkhead isolation so one slow dependency can't eat all threads. Retries without a breaker turn a blip into a self-inflicted DDoS."</div>
`,

"async-multithreading-resilience__exponential-backoff-jitter-polly": `
<p class="lead">Backoff spaces out retries (1s, 2s, 4s…). Without <strong>jitter</strong>, all failed callers retry at the same instants, recreating the spike that caused the failure — a synchronized retry storm. Jitter randomizes the delays so load spreads out.</p>
<pre><code>var policy = Policy
    .Handle&lt;HttpRequestException&gt;()
    .WaitAndRetryAsync(
        retryCount: 4,
        sleepDurationProvider: attempt =&gt;
            TimeSpan.FromSeconds(Math.Pow(2, attempt))
            + TimeSpan.FromMilliseconds(Random.Shared.Next(0, 500)));</code></pre>
<p>Modern Polly v8 / <code>AddResilienceHandler</code> has <code>DelayBackoffType.Exponential</code> with <code>UseJitter = true</code> built in.</p>
<div class="say"><strong>Say this:</strong> "Backoff spaces retries out exponentially — 1, 2, 4 seconds — so you don't hammer a struggling service. Without jitter every failed caller retries at the same instants and recreates the spike, a synchronized retry storm; jitter randomizes the delays so the load spreads. Polly v8's resilience handler has exponential backoff with UseJitter built in."</div>
`,

"async-multithreading-resilience__prevent-two-workers-processing-the-same-job": `
<p class="lead">Pick a coordination point and make <strong>claiming the job atomic</strong>.</p>
<ul>
<li><strong>Database queue:</strong> <code>SELECT ... FOR UPDATE SKIP LOCKED</code> (PostgreSQL) — each worker locks and takes a different row; others skip locked rows. Simple, transactional, no extra infra.</li>
<li><strong>Redis lock / lease:</strong> <code>SET job:id worker NX PX ttl</code> — only one worker wins. Renew the lease for long jobs; use a <strong>fencing token</strong> so a worker whose lease expired can't commit stale work.</li>
<li><strong>Broker competing consumers:</strong> Service Bus peek-lock guarantees one active consumer per message — complete on success, abandon/dead-letter on failure.</li>
</ul>
<div class="warn"><strong>Always pair claiming with idempotency.</strong> At-least-once means a job can still run twice (lease expiry, redelivery), so the work itself must be safe to repeat — "what happens when the lock expires mid-job?" is the follow-up, and the answer is idempotent + ideally fenced.</div>
<div class="say"><strong>Say this:</strong> "I make claiming the job atomic at a coordination point: SELECT FOR UPDATE SKIP LOCKED on a DB queue, a Redis SET NX lease with renewal and a fencing token, or a broker's peek-lock giving one consumer per message. But I always pair it with idempotency, because at-least-once means a lease can expire mid-job and a second worker can start — so the work has to be safe to run twice."</div>
`,

"asp-net-core-web-apis__request-lifecycle-middleware-pipeline": `
<p class="lead">An ASP.NET Core request flows through an <strong>ordered pipeline of middleware</strong>. Each component can run code before and after the next one, or short-circuit the request. You build the pipeline in <code>Program.cs</code> with <code>app.Use...</code>, and <strong>order matters</strong>.</p>
<h2>The flow</h2>
<p>Kestrel receives the request → it passes through the middleware chain → reaches an endpoint (controller or minimal API) → the response unwinds back out through the same middleware in reverse.</p>
<pre><code>app.UseExceptionHandler();   // first: catches everything below
app.UseHttpsRedirection();
app.UseRouting();            // decides which endpoint
app.UseCors();
app.UseAuthentication();     // who are you
app.UseAuthorization();      // are you allowed  (AFTER authn, AFTER routing)
app.MapControllers();        // the endpoint</code></pre>
<p>Each middleware is a <code>RequestDelegate</code>; it calls <code>await next()</code> to pass through, and code after <code>next()</code> runs on the way out — the same mental model as chain-of-responsibility.</p>
<div class="say"><strong>Say this:</strong> "A request flows through an ordered middleware pipeline — each middleware runs code before and after calling next, or short-circuits. Order is critical: exception handling first, then routing, then authentication before authorization, then the endpoint; the response unwinds back out in reverse. It's chain-of-responsibility applied to HTTP."</div>
`,

"asp-net-core-web-apis__controllers-vs-minimal-apis": `
<p class="lead">Two ways to define endpoints, trading convention and features against ceremony and overhead.</p>
<ul>
<li><strong>Controllers (MVC):</strong> class-based, attribute routing, model binding, filters, conventions — good for large APIs with lots of cross-cutting concerns.</li>
<li><strong>Minimal APIs (.NET 6+):</strong> map endpoints as lambdas (<code>app.MapGet(...)</code>), less ceremony and slightly lower overhead — great for small, focused services and microservices.</li>
</ul>
<p>Minimal APIs have closed much of the gap with <strong>endpoint filters</strong>, DI, and validation libraries. Pick controllers for large, convention-heavy APIs; minimal for small, performance-sensitive, or simple services.</p>
<div class="say"><strong>Say this:</strong> "Controllers are class-based with attribute routing, filters and conventions — good for large APIs with lots of cross-cutting concerns. Minimal APIs map endpoints as lambdas with less ceremony and lower overhead — great for small microservices. They've closed the gap with endpoint filters and DI, so I use minimal for simple services and controllers when the filter and convention machinery earns its keep."</div>
`,

"asp-net-core-web-apis__model-binding-validation": `
<p class="lead">Model binding maps HTTP request data — route, query, body, headers, form — onto action parameters or a DTO. Validation then checks the bound model and populates <code>ModelState</code>.</p>
<h2>Validating cleanly</h2>
<ul>
<li>Use DataAnnotations (<code>[Required]</code>, <code>[Range]</code>) or <strong>FluentValidation</strong> on a request DTO; with <code>[ApiController]</code>, invalid models auto-return a 400 with the errors.</li>
<li>Bind to <strong>request DTOs, not EF entities</strong> — binding to entities invites over-posting / mass-assignment (a client sets fields it shouldn't).</li>
<li>Keep true domain invariants in the domain; use annotations for shape/format at the edge.</li>
</ul>
<div class="say"><strong>Say this:</strong> "Model binding maps route, query, body and header data onto a DTO; validation runs attributes or FluentValidation and, with [ApiController], auto-returns a 400. I bind to request DTOs, not EF entities, to avoid over-posting, validate shape at the edge, and keep real domain invariants in the domain rather than as annotations."</div>
`,

"asp-net-core-web-apis__di-lifetimes-in-practice-the-pitfalls": `
<p class="lead">Three service lifetimes: <strong>Singleton</strong> (one per app), <strong>Scoped</strong> (one per request/scope), <strong>Transient</strong> (new each resolution). The lifetime is a correctness decision, not a performance one.</p>
<h2>The pitfalls</h2>
<ul>
<li><strong>Captive dependency:</strong> injecting a Scoped/Transient into a Singleton captures it for the app's life.</li>
<li><strong>DbContext is Scoped and not thread-safe</strong> — never share it across requests or threads.</li>
<li>Resolving scoped services from the <em>root</em> provider (no active scope) throws or misbehaves.</li>
<li>A Transient <code>IDisposable</code> captured by a longer-lived service lives as long as that service.</li>
</ul>
<p>.NET validates scopes at startup in Development (<code>ValidateScopes</code>/<code>ValidateOnBuild</code>).</p>
<div class="say"><strong>Say this:</strong> "Singleton is one per app, Scoped one per request, Transient new each time. The pitfalls: injecting a Scoped into a Singleton captures it forever; DbContext is Scoped and not thread-safe so never shared; and resolving scoped services from the root provider. .NET's ValidateScopes catches the captive-dependency case at startup in Development."</div>
`,

"asp-net-core-web-apis__singleton-depending-on-scoped-captive-dependency": `
<p class="lead">The <strong>captive dependency</strong> bug: a Scoped service injected into a Singleton is <em>captured</em> and effectively lives forever — one instance shared across every request.</p>
<div class="warn"><strong>Why it's dangerous:</strong> if the captured service holds request state — like a <code>DbContext</code> — you get cross-request data bleed, and because <code>DbContext</code> isn't thread-safe, concurrent requests corrupt it.</div>
<h2>The fix</h2>
<p>Don't inject Scoped into Singleton. Inject <code>IServiceScopeFactory</code> and create a scope per unit of work:</p>
<pre><code>using var scope = _scopeFactory.CreateScope();
var db = scope.ServiceProvider.GetRequiredService&lt;AppDb&gt;();</code></pre>
<p>.NET catches this at startup when <code>ValidateScopes</code> is on (default in Development).</p>
<div class="say"><strong>Say this:</strong> "This is the captive dependency: a Scoped service injected into a Singleton is captured and lives for the app's lifetime, shared across all requests. With a DbContext that means cross-request data bleed and corruption since it isn't thread-safe. I fix it by injecting IServiceScopeFactory and creating a scope per unit of work. Just saying 'captive dependency' signals I've hit this in production."</div>
`,

"asp-net-core-web-apis__the-options-pattern-configuration": `
<p class="lead">Configuration is <strong>layered</strong> — appsettings.json, environment-specific files, environment variables, Key Vault, command line — with later sources overriding earlier. The <strong>Options pattern</strong> binds a config section to a strongly-typed POCO.</p>
<h2>The three Options interfaces</h2>
<ul>
<li><code>IOptions&lt;T&gt;</code> — singleton, bound once at startup.</li>
<li><code>IOptionsSnapshot&lt;T&gt;</code> — per-request, re-reads on reload.</li>
<li><code>IOptionsMonitor&lt;T&gt;</code> — singleton with change notifications (reload-on-change).</li>
</ul>
<p>Validate options with <code>ValidateDataAnnotations</code> + <code>ValidateOnStart</code> so bad config fails fast. Keep <strong>secrets in Key Vault / user-secrets</strong>, never in appsettings.</p>
<div class="say"><strong>Say this:</strong> "Configuration is layered — appsettings, environment overrides, env vars, Key Vault — with later sources winning. I bind sections to typed POCOs via the Options pattern: IOptions for static config, IOptionsSnapshot for per-request reload, IOptionsMonitor for change notifications in singletons. I validate options at startup with ValidateOnStart, and keep secrets in Key Vault, not appsettings."</div>
`,

"asp-net-core-web-apis__global-exception-handling-problemdetails": `
<p class="lead">Centralize error handling instead of try/catch in every action. Use exception-handling middleware (<code>UseExceptionHandler</code>) or <code>IExceptionHandler</code> (.NET 8) to catch unhandled exceptions, log them, and return a consistent response.</p>
<h2>ProblemDetails (RFC 7807)</h2>
<p>Return a standard error body — <code>type</code>, <code>title</code>, <code>status</code>, <code>detail</code>, and a <code>traceId</code> — so clients and support get a predictable shape. Map domain exceptions to status codes in one place.</p>
<div class="warn"><strong>Never leak</strong> stack traces or internal details in production — log them server-side, return the <code>traceId</code> for correlation.</div>
<div class="say"><strong>Say this:</strong> "I centralize error handling with exception-handling middleware or IExceptionHandler in .NET 8 — catch unhandled exceptions, log them, and return a consistent RFC 7807 ProblemDetails with type, title, status and a traceId. Domain exceptions map to status codes in one place, I never leak stack traces in production, and the traceId lets support correlate the error to the logs."</div>
`,

"asp-net-core-web-apis__idempotent-endpoint-handling-duplicate-requests": `
<p class="lead">Clients retry — timeouts, double-clicks, flaky mobile networks — so a <code>POST</code> can arrive twice. Make the endpoint <strong>idempotent</strong> so duplicates don't double-create or double-charge.</p>
<h2>Idempotency key</h2>
<p>The client sends a unique key (e.g. an <code>Idempotency-Key</code> header). The server records processed keys with their result; a repeat key returns the <em>stored</em> result instead of re-executing — and the key + response are recorded <strong>in the same transaction as the effect</strong>.</p>
<pre><code>if (await _store.TryGetResult(key, out var saved)) return saved;   // duplicate
var result = await DoWork(cmd);
await _store.Save(key, result);    // same transaction as the effect
return result;</code></pre>
<p>Prefer <strong>natural idempotency</strong> where possible (a <code>PUT</code> by id, an upsert). <code>GET</code>/<code>PUT</code>/<code>DELETE</code> are idempotent by HTTP semantics; <code>POST</code> is not.</p>
<div class="say"><strong>Say this:</strong> "Clients retry, so a POST can arrive twice — I make the write idempotent. The client sends an idempotency key; the server records processed keys with their result in the same transaction as the effect, and a repeat key returns the stored response instead of re-executing. Where I can I design naturally idempotent operations like a PUT by id. GET/PUT/DELETE are idempotent by HTTP; POST isn't."</div>
`,

"asp-net-core-web-apis__rate-limiting-middleware-net-7": `
<p class="lead">The built-in rate limiting middleware (.NET 7+) protects an API from abuse and overload.</p>
<h2>Algorithms &amp; partitioning</h2>
<ul>
<li><strong>Fixed window, sliding window, token bucket, concurrency limit</strong> — pick per policy.</li>
<li>Partition by user / IP / API key with a <code>PartitionedRateLimiter</code>.</li>
<li>Rejected requests get <strong>429 Too Many Requests</strong> with a <code>Retry-After</code> header.</li>
</ul>
<div class="warn"><strong>Multi-instance:</strong> the built-in limiter is <em>per-node</em>. For a global limit across replicas, back it with a distributed store (Redis).</div>
<div class="say"><strong>Say this:</strong> "The built-in rate limiter supports fixed/sliding window, token bucket and concurrency limits, partitioned by user, IP or API key, returning 429 with Retry-After. It's per-instance, so for a global limit across replicas I back it with Redis. It protects against abuse and overload, complementing — not replacing — the gateway or WAF at the edge."</div>
`,

"asp-net-core-web-apis__api-versioning-backward-compatibility": `
<p class="lead">APIs evolve, and you can't break existing clients. Version deliberately and prefer additive change.</p>
<h2>Strategies</h2>
<ul>
<li><strong>URL path</strong> (<code>/v1/</code>, <code>/v2/</code>) — most explicit and common.</li>
<li><strong>Query string</strong> (<code>?api-version=2</code>) or a <strong>header</strong> (custom or <code>Accept</code>).</li>
</ul>
<p>Use the <code>Asp.Versioning</code> library. <strong>Additive</strong> changes (new optional fields) are backward compatible; removing/renaming a field or changing its type/meaning is <strong>breaking</strong> → new version. Run versions side by side during migration and deprecate with sunset headers.</p>
<div class="say"><strong>Say this:</strong> "APIs evolve without breaking clients. I version via the URL path usually — /v1, /v2 — with the Asp.Versioning library. Additive changes like new optional fields are backward compatible; removing or changing a field is breaking and needs a new version, run side by side during migration with sunset headers. I prefer additive evolution and version only when I truly break the contract."</div>
`,

"asp-net-core-web-apis__authentication-middleware-jwt-oauth2-oidc": `
<p class="lead">Authentication is <em>who you are</em>; authorization is <em>what you can do</em>. In ASP.NET Core you register a scheme and place the middleware correctly.</p>
<pre><code>builder.Services.AddAuthentication().AddJwtBearer(/* issuer, audience, keys */);
app.UseAuthentication();   // populate the user
app.UseAuthorization();    // enforce policy  (AFTER authentication)</code></pre>
<p>For APIs, validate a <strong>JWT Bearer</strong> token — signature, issuer, audience, expiry — issued by an identity provider (Entra ID, Auth0). <strong>OAuth2</strong> is the authorization framework; <strong>OIDC</strong> adds an identity layer (the <code>id_token</code>) on top. The token's claims become the <code>ClaimsPrincipal</code> (<code>User</code>); authorize with <code>[Authorize]</code>, roles, or policies.</p>
<div class="say"><strong>Say this:</strong> "Authentication is who you are, authorization is what you can do. For APIs I use JWT Bearer — AddAuthentication with the JWT scheme, UseAuthentication before UseAuthorization — validating the token's signature, issuer, audience and expiry against the identity provider. OAuth2 is the authorization framework and OIDC adds the identity layer with an id_token. The claims become the ClaimsPrincipal, and I authorize with policies over roles."</div>
`,

"asp-net-core-web-apis__middleware-vs-filters-vs-endpoint-filters": `
<p class="lead">Three cross-cutting hooks at different levels of the pipeline — choose by what context you need and whether the concern is global or per-endpoint.</p>
<table>
<tr><th>Hook</th><th>Runs</th><th>Knows</th><th>Good for</th></tr>
<tr><td>Middleware</td><td>every request, before routing</td><td>HttpContext (not MVC)</td><td>logging, exception handling, auth — global</td></tr>
<tr><td>MVC filters</td><td>within MVC, after routing</td><td>action, model, result</td><td>per-action validation, caching, authorization</td></tr>
<tr><td>Endpoint filters</td><td>around a minimal-API handler</td><td>endpoint + args</td><td>the minimal-API equivalent of action filters</td></tr>
</table>
<div class="say"><strong>Say this:</strong> "Middleware runs for every request before routing and sees HttpContext but not MVC specifics — ideal for global logging, auth and exception handling. MVC filters run after routing and know the action and model — good for per-action validation or caching. Endpoint filters are the minimal-API equivalent around a handler. I choose by whether it's global or per-endpoint and what context I need."</div>
`,

"asp-net-core-web-apis__ihostedservice-backgroundservice": `
<p class="lead"><code>IHostedService</code> runs background work tied to the application lifetime (<code>StartAsync</code>/<code>StopAsync</code>); <code>BackgroundService</code> is the base class with an <code>ExecuteAsync</code> loop. Use it for queue consumers, timers, cache warming, and scheduled jobs.</p>
<h2>The pitfalls</h2>
<ul>
<li>It's a <strong>Singleton</strong> — to use a Scoped service like <code>DbContext</code>, create a scope <em>per iteration</em> with <code>IServiceScopeFactory</code>.</li>
<li>Honor the <code>stoppingToken</code> for graceful shutdown; a long <code>StartAsync</code> blocks app startup.</li>
<li>Wrap the loop in try/catch — an unhandled exception can stop the host.</li>
</ul>
<p>For richer scheduling use Hangfire/Quartz; for durable work, a broker consumer.</p>
<div class="say"><strong>Say this:</strong> "IHostedService / BackgroundService runs background work tied to the app lifetime — a queue consumer, a timer, cache warming. It's a Singleton, so to use a DbContext I create a scope per iteration with IServiceScopeFactory, honor the stopping token for graceful shutdown, and wrap the loop so an exception doesn't kill the host. For richer scheduling I'd use Hangfire or Quartz, and for durable work a broker consumer."</div>
`,

"asp-net-core-web-apis__health-checks-liveness-readiness-deps": `
<p class="lead">Health checks tell orchestrators and load balancers whether to route traffic or restart the app.</p>
<ul>
<li><strong>Liveness:</strong> is the process alive? Keep it cheap, no dependencies. Failure → <em>restart</em> the pod.</li>
<li><strong>Readiness:</strong> is it ready to serve? Check critical dependencies (DB, Redis, broker). Failure → <em>pull from rotation</em> but don't restart.</li>
</ul>
<p>Map these to Kubernetes <code>livenessProbe</code>/<code>readinessProbe</code> (plus a <code>startupProbe</code> for slow starts). Register checks with <code>AddHealthChecks</code> and <strong>tag</strong> them so liveness and readiness use different sets.</p>
<div class="say"><strong>Say this:</strong> "Health checks tell the orchestrator whether to route or restart. Liveness is 'is the process alive' — cheap, no dependencies, restart on failure; readiness is 'can it serve' — checks DB/Redis/broker, and on failure it's pulled from rotation without a restart. I map them to Kubernetes liveness and readiness probes, plus a startup probe for slow boots, and tag checks so each probe uses the right set."</div>
`,

"asp-net-core-web-apis__cors-what-it-is-and-is-not": `
<p class="lead">CORS (Cross-Origin Resource Sharing) is a <strong>browser</strong> security mechanism that controls which <em>origins</em> (scheme + host + port) may make cross-origin requests to your API from JavaScript. The server sends <code>Access-Control-Allow-*</code> headers; the browser enforces them.</p>
<div class="warn"><strong>What CORS is NOT:</strong> it is not authentication or authorization, not server-side protection (non-browser clients like curl and Postman ignore it entirely), and not CSRF protection. People constantly confuse CORS with CSRF.</div>
<p>Configure a <strong>specific-origin</strong> policy with <code>UseCors</code>; never combine <code>AllowAnyOrigin</code> with credentials. Non-simple requests trigger a preflight <code>OPTIONS</code>.</p>
<div class="say"><strong>Say this:</strong> "CORS is a browser mechanism controlling which origins can call my API from JavaScript — the server sends Allow-Origin headers and the browser enforces. It is NOT security, authentication, or CSRF protection, and it doesn't stop non-browser clients like curl, which ignore it. I configure a specific-origin policy and never mix AllowAnyOrigin with credentials."</div>
`,

"asp-net-core-web-apis__output-response-caching-cache-headers": `
<p class="lead">Cache responses to cut load and latency — two mechanisms plus HTTP cache headers.</p>
<ul>
<li><strong>Response caching</strong> respects HTTP cache headers (<code>Cache-Control</code>, <code>Expires</code>, <code>ETag</code>, <code>Vary</code>) for client and proxy caches.</li>
<li><strong>Output caching</strong> (.NET 7+) is a <em>server-side</em> cache of the response with policies, <strong>tag-based invalidation</strong>, and vary-by — more control than response caching.</li>
<li><strong>ETags + conditional requests</strong> (<code>If-None-Match</code> → <code>304 Not Modified</code>) save bandwidth.</li>
</ul>
<p>Cache GETs, <strong>vary by the keys that matter</strong> (auth, query) so you never serve one user's data to another, and back it with Redis for a shared cache across instances.</p>
<div class="say"><strong>Say this:</strong> "I cut load with caching: response caching respects headers like Cache-Control and ETag for client and proxy caches, while output caching in .NET 7+ is a server-side cache with policies, vary-by and tag-based invalidation. ETags with conditional requests return 304 and save bandwidth. I cache GETs, vary by auth and query so I never leak one user's data, and back it with Redis across instances."</div>
`,

"asp-net-core-web-apis__signalr-websockets-hubs-redis-backplane": `
<p class="lead">For real-time server-to-client push — notifications, live dashboards, chat — use <strong>SignalR</strong>, an abstraction over WebSockets that falls back to SSE or long-polling. <strong>Hubs</strong> expose methods in both directions, and clients join <strong>groups</strong>.</p>
<div class="warn"><strong>The scale-out catch:</strong> with multiple server instances, a message sent from one instance only reaches the clients connected <em>to that instance</em>. Add a <strong>backplane</strong> — Redis, or the Azure SignalR Service — so messages fan out across all instances.</div>
<p>WebSockets is the raw transport; SignalR adds reconnection, groups, and transport fallback on top.</p>
<div class="say"><strong>Say this:</strong> "For server-to-client push I use SignalR, which rides WebSockets and falls back to SSE or long-polling. Hubs expose bidirectional methods and clients join groups. The scale-out catch is that a message from one instance only reaches that instance's clients, so I add a Redis backplane or Azure SignalR Service to fan messages out across all instances."</div>
`,

"asp-net-core-web-apis__what-makes-a-good-api-design": `
<p class="lead">A good HTTP API is <strong>predictable and consistent</strong> — that beats clever every time.</p>
<ul>
<li><strong>Resource-oriented:</strong> nouns, not verbs (<code>/orders/{id}</code>).</li>
<li><strong>Correct methods:</strong> GET (safe, idempotent), POST (create), PUT (replace), PATCH (partial), DELETE — and correct <strong>status codes</strong> (200/201/204, 400/401/403/404/409/422/429, 500).</li>
<li><strong>Consistent naming, pagination</strong> (keyset for large sets), filtering/sorting.</li>
<li><strong>Versioning</strong>, <strong>idempotency keys</strong> for POST, <strong>ProblemDetails</strong> for errors.</li>
<li><strong>Secured</strong> (auth, rate limiting), <strong>documented</strong> (OpenAPI), and <strong>evolvable</strong> (additive change).</li>
</ul>
<div class="say"><strong>Say this:</strong> "A good API is resource-oriented with the right HTTP methods and status codes, consistent naming, pagination and filtering, proper versioning, idempotency keys for POST, and ProblemDetails for errors. It's secured, rate-limited, documented with OpenAPI, and evolves additively so it doesn't break clients. The overarching rule is predictability and consistency over cleverness."</div>
`,

"asp-net-core-web-apis__openapi-swagger-contract-first": `
<p class="lead"><strong>OpenAPI</strong> is a standard, machine-readable description of a REST API; <strong>Swagger</strong> is the tooling around it (Swagger UI, codegen). Two ways to work with it:</p>
<ul>
<li><strong>Code-first:</strong> generate the spec from your code and attributes — common in .NET with Swashbuckle/NSwag (and built-in in .NET 9).</li>
<li><strong>Contract-first:</strong> write the OpenAPI spec first, generate server stubs and typed clients, and review/agree the contract before coding — enabling parallel client/server work and breaking-change detection in CI.</li>
</ul>
<p>Use the spec to generate typed clients and living documentation.</p>
<div class="say"><strong>Say this:</strong> "OpenAPI is the machine-readable description of a REST API and Swagger is the tooling. Code-first generates the spec from attributes — easy in .NET with Swashbuckle. Contract-first writes the spec first, generates stubs and clients, and lets teams review and agree the contract before coding, with breaking-change detection in CI. I use the spec for typed clients and docs, and .NET 9 generates OpenAPI out of the box."</div>
`,

"asp-net-core-web-apis__graphql-when-it-helps-and-when-it-hurts": `
<p class="lead">GraphQL is a query language where the <strong>client specifies exactly the fields it wants</strong> from a single endpoint.</p>
<h2>When it helps</h2>
<ul>
<li>Eliminates over- and under-fetching; one request for nested/related data — great for mobile and aggregating multiple backends.</li>
<li>Strong typed schema that evolves without URL versioning.</li>
</ul>
<h2>When it hurts</h2>
<ul>
<li><strong>Caching is harder</strong> (POST, no URL-based HTTP cache).</li>
<li>Resolvers hit the <strong>N+1 problem</strong> — you need DataLoader batching.</li>
<li><strong>Query depth/complexity attacks</strong> — you must bound them.</li>
<li>More server complexity; overkill for simple CRUD where REST is simpler.</li>
</ul>
<p>In .NET, Hot Chocolate is the server.</p>
<div class="say"><strong>Say this:</strong> "GraphQL lets the client ask for exactly the fields it needs from one endpoint — it kills over- and under-fetching and is great for mobile and aggregating backends, with a typed schema that evolves without versioning. The costs: HTTP caching is harder, resolvers hit the N+1 problem so you need DataLoader, and you must bound query depth against abuse. I use it for rich client-driven APIs and stick with REST for simple CRUD; Hot Chocolate is the .NET server."</div>
`,

"grpc__grpc-vs-rest-vs-messaging-when-each": `
<p class="lead">gRPC is <strong>contract-first RPC over HTTP/2 with Protocol Buffers</strong> (compact binary). Its strengths: performance (binary serialization + HTTP/2 multiplexing + header compression), a strong <code>.proto</code> contract that generates typed clients/servers in every language, and first-class streaming.</p>
<h2>When each</h2>
<ul>
<li><strong>gRPC:</strong> internal service-to-service calls where latency, throughput, and a strict contract matter.</li>
<li><strong>REST/JSON:</strong> broad reach (browsers, third parties), human-readable payloads, HTTP caching, simple CRUD.</li>
<li><strong>Messaging (async):</strong> decoupling, fire-and-forget side effects, load leveling, events.</li>
</ul>
<p>The decision axis: need an answer <em>now</em> over a tight internal contract → gRPC; public reach → REST; decoupling and reliability → a queue.</p>
<div class="say"><strong>Say this:</strong> "gRPC is contract-first RPC over HTTP/2 with Protobuf — fast binary serialization, multiplexing, and a .proto that generates typed clients in every language, with first-class streaming. I use it for internal service-to-service where latency and a strict contract matter, REST/JSON for broad public reach and caching, and messaging when I need decoupling and reliability rather than an immediate answer."</div>
`,

"grpc__the-four-rpc-types-http-2-multiplexing": `
<p class="lead">gRPC has four call shapes, all over HTTP/2.</p>
<ul>
<li><strong>Unary:</strong> one request → one response (the default; like a method call).</li>
<li><strong>Server streaming:</strong> one request → a stream of responses (a feed, progress updates).</li>
<li><strong>Client streaming:</strong> a stream of requests → one response (upload chunks, then a summary).</li>
<li><strong>Bidirectional streaming:</strong> both sides stream independently over one connection (chat, live sync).</li>
</ul>
<h2>HTTP/2 multiplexing</h2>
<p>Each call is a <em>stream</em>; many streams share one TCP connection concurrently without head-of-line blocking at the HTTP layer. That's exactly why you reuse a single <strong>channel</strong> rather than opening a connection per call.</p>
<div class="say"><strong>Say this:</strong> "Four call types: unary one-to-one, server streaming one-to-many, client streaming many-to-one, and bidirectional where both sides stream over one connection. HTTP/2 multiplexing makes each call a stream and runs many concurrently over a single TCP connection without HTTP-layer head-of-line blocking — which is why I reuse one channel instead of a connection per call."</div>
`,

"grpc__why-protobuf-is-fast-compact": `
<p class="lead">Protocol Buffers are binary and schema-driven, which is what makes them small and fast.</p>
<ul>
<li>The wire carries <strong>field numbers + wire types</strong>, not field names — far smaller than JSON's repeated keys and quoting.</li>
<li><strong>Varint encoding</strong> for integers — small numbers use fewer bytes.</li>
<li>No text parsing — decode is fast and allocation-light; codegen gives strongly-typed messages.</li>
</ul>
<div class="warn"><strong>Trade-off:</strong> not human-readable (you need the <code>.proto</code> to decode) and not self-describing. Great for internal service-to-service; JSON wins for debuggability and broad reach.</div>
<div class="say"><strong>Say this:</strong> "Protobuf is binary and schema-driven — the wire carries field numbers and wire types, not names, so it's far smaller than JSON, with varint encoding for integers and no text parsing to slow decode. The trade-off is it's not human-readable and needs the .proto to decode. Great for internal calls; JSON wins on debuggability and reach."</div>
`,

"grpc__proto-contract-design-backward-compatibility": `
<p class="lead"><strong>Field numbers are the contract, not names.</strong> Design the proto so you can evolve it without breaking deployed clients.</p>
<ul>
<li>Never reuse or change a field number; <strong>reserve</strong> retired ones.</li>
<li>Adding <em>optional</em> fields is backward compatible — old clients ignore unknown fields.</li>
<li>Never change a field's type or remove a semantic others depend on.</li>
<li>Prefer additive evolution; version the service (<code>package foo.v2</code>) for breaking changes and run both during migration.</li>
</ul>
<div class="say"><strong>Say this:</strong> "In Protobuf the field numbers are the contract, not the names — I never reuse or change a number and I reserve retired ones. Adding optional fields is backward compatible because old clients ignore unknown fields; changing a field's type or meaning is breaking. I evolve additively and version the package, like foo.v2, for breaking changes — that's how I'd migrate a feature into a new service without breaking existing customers."</div>
`,

"grpc__deadlines-cancellation-propagate-end-to-end": `
<p class="lead">A <strong>deadline</strong> is an absolute time by which the call must finish; the client sets it and it travels with the request. A <strong>CancellationToken</strong> lets the caller abort early.</p>
<div class="warn"><strong>Why it matters:</strong> without deadlines, a slow or hung downstream call ties up the caller indefinitely, and under load that cascades into resource exhaustion. If you don't propagate cancellation, an abandoned request keeps doing work nobody is waiting for.</div>
<h2>How you handle it</h2>
<p>Set a deadline on every call (<code>deadline: DateTime.UtcNow.AddSeconds(2)</code>); pass the incoming request's token into every downstream gRPC/DB/HTTP call so cancellation flows through the whole chain; honor <code>context.CancellationToken</code> on the server. A deadline surfaces as <code>StatusCode.DeadlineExceeded</code>. <strong>Budget</strong> the deadline across the chain (if the edge has 2s, downstream gets less) rather than copying the same value everywhere.</p>
<div class="say"><strong>Say this:</strong> "A deadline is an absolute finish-time the client sets and that travels with the request; cancellation lets the caller abort. Without deadlines a hung downstream ties up the caller and cascades into exhaustion. I set a deadline on every call and propagate the request's cancellation token into every downstream call, and I budget the deadline across the chain rather than copying the same value. 'Propagate the deadline and token end-to-end' is the senior phrase."</div>
`,

"grpc__error-handling-rpcexception-status-codes": `
<p class="lead">gRPC failures surface as <code>RpcException</code> carrying a <code>StatusCode</code> and <code>Status.Detail</code>. Handle them by classifying the code.</p>
<table>
<tr><th>Class</th><th>Codes</th><th>Action</th></tr>
<tr><td>Transient / retryable</td><td>Unavailable, ResourceExhausted, sometimes DeadlineExceeded</td><td>retry with backoff</td></tr>
<tr><td>Caller error</td><td>InvalidArgument, NotFound, PermissionDenied, Unauthenticated</td><td>do not retry — fix the request</td></tr>
<tr><td>Server fault</td><td>Internal, Unknown</td><td>usually don't blindly retry</td></tr>
</table>
<p>Return rich errors via <code>Status</code> + trailers/metadata rather than throwing raw exceptions, and map domain errors to the appropriate status code.</p>
<div class="say"><strong>Say this:</strong> "gRPC failures come back as RpcException with a StatusCode. Unavailable and ResourceExhausted are transient and retryable; InvalidArgument, NotFound, PermissionDenied and Unauthenticated are caller errors — don't retry; Internal and Unknown usually aren't blindly retried. I map domain errors to the right code with details in trailers, and key my retry policy off the status code rather than retrying any exception."</div>
`,

"grpc__retries-without-duplicating-non-idempotent-ops": `
<p class="lead">gRPC supports retry policies in the service config (max attempts, backoff, retryable codes) and hedging — but retries are dangerous for <strong>non-idempotent</strong> operations.</p>
<div class="warn"><strong>The hazard:</strong> for "charge the card" or "create order", a timeout doesn't tell you whether the server already applied the change — retrying can double-apply. (Streaming calls have extra restrictions, and a call already committed won't be retried.)</div>
<h2>How to handle it</h2>
<p>Make the operation <strong>idempotent</strong>, then retry freely: a client-generated <strong>idempotency key</strong> the server dedups on, or a write designed so re-applying is a no-op (upsert, or a conditional update with a version). Enable automatic retries only for calls you've made safe; for the rest, surface the failure to the caller.</p>
<div class="say"><strong>Say this:</strong> "gRPC can retry automatically, but that's dangerous for non-idempotent operations — a timeout doesn't say whether the server already charged the card, so a retry double-applies. So I make the operation idempotent first — an idempotency key the server dedups on, or an upsert / version-conditional write — then retry freely, and enable retries only on calls I've made safe. Retry only idempotent calls; make the rest idempotent with a dedup key."</div>
`,

"grpc__10-parallel-calls-partial-failure-deadline-cancel": `
<p class="lead">Calling many services at once: reuse a single <strong>channel</strong> per target (channels are expensive, thread-safe, and multiplex), fire the calls concurrently with a <em>shared</em> deadline, and don't let one failure lose the others.</p>
<pre><code>using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
cts.CancelAfter(TimeSpan.FromSeconds(2));              // shared budget
var tasks = targets.Select(t =&gt; SafeAsync(CallAsync(t, cts.Token)));
var results = await Task.WhenAll(tasks);              // each wrapped as Result&lt;T&gt;</code></pre>
<h2>Partial-failure strategy — decide per use case</h2>
<ul>
<li><strong>All-or-nothing:</strong> if any fails, the whole operation fails (and you may cancel the rest to save work).</li>
<li><strong>Best-effort:</strong> collect successes, record failures, return what you have (common for aggregation/fan-out).</li>
</ul>
<p>Wrap each call so an exception becomes a result object rather than making <code>Task.WhenAll</code> throw and swallow the others.</p>
<div class="say"><strong>Say this:</strong> "I reuse one channel per target — channels are expensive and multiplex — and fire the calls concurrently with a shared deadline via a linked cancellation source. I wrap each call so an exception becomes a result object rather than making WhenAll throw and swallow the others. Then I pick a partial-failure policy per use case: all-or-nothing, cancelling the rest, or best-effort, collecting successes and recording failures. Mentioning channel reuse unprompted matters — a channel per call is the common gotcha."</div>
`,

"grpc__interceptors-metadata-authentication-mtls-bearer": `
<p class="lead"><strong>Interceptors</strong> are gRPC's middleware — client- and server-side hooks that wrap every call — for cross-cutting concerns without touching service logic: attaching auth tokens, logging/metrics/tracing (correlation ids), centralized exception → status mapping, client-side retry/deadline defaults.</p>
<h2>Metadata &amp; auth</h2>
<p><strong>Metadata</strong> is key/value headers sent with a call — the gRPC equivalent of HTTP headers — carrying auth tokens, correlation ids, tenant info. <strong>Channel credentials</strong> handle transport security (TLS); <strong>call credentials</strong> attach per-call identity (a bearer JWT in metadata). On the server, validate the token in an <em>interceptor</em> so every method is protected uniformly. <strong>mTLS</strong> is common for service-to-service auth in a mesh.</p>
<div class="say"><strong>Say this:</strong> "Interceptors are gRPC's middleware — client and server hooks around every call for auth, logging, tracing and exception-to-status mapping, the same model as ASP.NET middleware. Metadata is the key/value headers carrying tokens and correlation ids. Channel credentials give transport TLS, call credentials attach a per-call bearer token, and I validate it in a server interceptor so every method is protected uniformly. mTLS is common for service-to-service in a mesh."</div>
`,

"grpc__connection-mgmt-keepalive-channel-reuse-l7-load-balancing": `
<p class="lead">A <strong>channel</strong> is a long-lived HTTP/2 connection — create it once and reuse it; it multiplexes all calls and reconnects automatically.</p>
<div class="warn"><strong>The #1 gRPC perf bug</strong> is creating a channel per call — it defeats HTTP/2 multiplexing and exhausts connections.</div>
<ul>
<li><strong>Keepalive pings</strong> detect dead connections and keep idle/NAT connections alive; tune the interval/timeout (too aggressive and the server throttles you with GOAWAY).</li>
<li><strong>Max connection age</strong> forces periodic reconnects so clients rebalance onto new backends.</li>
<li>Set per-call deadlines regardless of connection settings.</li>
</ul>
<h2>Why L7 load balancing</h2>
<p>gRPC pins many calls to one HTTP/2 connection, so an L4 (TCP) balancer sends all your calls to a single pod. Use <strong>client-side load balancing</strong> (a resolver gives the pod list + round-robin) or a <strong>mesh/proxy</strong> (Envoy, Linkerd) that balances per-request.</p>
<div class="say"><strong>Say this:</strong> "A gRPC channel is a long-lived HTTP/2 connection — I create it once and reuse it; it multiplexes and reconnects itself. The number-one perf bug is a channel per call, which defeats multiplexing and exhausts sockets. Keepalive detects dead connections, max-connection-age forces rebalancing, and because many calls pin to one connection I need L7 load balancing — client-side round-robin or a mesh like Envoy — not an L4 balancer that pins everything to one pod."</div>
`,

"grpc__why-a-browser-can-t-call-grpc-grpc-web-transcoding": `
<p class="lead">Browsers don't expose raw HTTP/2 frames to JavaScript, so standard gRPC can't run from a web page.</p>
<h2>Options</h2>
<ul>
<li><strong>gRPC-Web + a proxy</strong> (Envoy) or ASP.NET Core's gRPC-Web middleware — a browser-compatible variant (with limited streaming).</li>
<li><strong>gRPC JSON transcoding</strong> — expose the same proto service as a REST/JSON API via annotations.</li>
</ul>
<p>Keep gRPC for internal service-to-service calls; expose REST or gRPC-Web at the edge for the Angular front end.</p>
<div class="say"><strong>Say this:</strong> "Browsers don't expose raw HTTP/2 frames to JavaScript, so standard gRPC can't run from a page. I use gRPC-Web — a browser-compatible variant via a proxy or ASP.NET Core's middleware, with limited streaming — or gRPC JSON transcoding to expose the same proto service as REST via annotations. I keep gRPC for internal service-to-service and expose REST or gRPC-Web at the edge for the Angular front end."</div>
`,
};
