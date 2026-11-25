/* Ukrainian translations of the Opus deep-dives, keyed by the same topic ids.
   Code, identifiers, framework names and acronyms stay in English for readability. */
window.OPUS_UK_EXPLANATIONS = {

"oop-solid-design-patterns__solid-kiss-dry-and-when-to-break-them": `
<p class="lead"><strong>SOLID</strong> веде до слабкої зв'язності та легких змін; <strong>KISS</strong> тримає рішення простим; <strong>DRY</strong> означає одне джерело правди для кожної одиниці знання. Це <em>евристики</em>, а не закони.</p>
<h2>Коли їх порушувати</h2>
<ul>
<li><strong>Надмірний DRY:</strong> об'єднання двох речей, які лише <em>схожі</em>, але позначають різні поняття, створює хибну абстракцію й зв'язує їх — «дублювання дешевше за хибну абстракцію» (Sandi Metz). Краще стерпіти випадкове дублювання, доки справжнє спільне поняття не стане очевидним.</li>
<li><strong>Надмірний SOLID:</strong> інтерфейси та шари заради єдиної реалізації — це оверинжиніринг; тут стримують KISS/YAGNI.</li>
</ul>
<p>Застосовуйте принципи, щоб зняти <em>реальний</em> біль, а не догматично.</p>
<div class="say"><strong>Скажіть так:</strong> «SOLID веде до слабкої зв'язності та легких змін, KISS тримає простоту, DRY — одне джерело правди на одиницю знання, але це евристики, а не закони. Класична помилка надмірного DRY — об'єднати дві речі, що лише схожі, але позначають різні поняття; це хибна абстракція, а дублювання дешевше за хибну абстракцію. Надмірний SOLID стає оверинжинірингом, де KISS і YAGNI стримують. Я застосовую їх, щоб зняти реальний біль, а не догматично».</div>
`,

"oop-solid-design-patterns__clean-hexagonal-architecture-the-dependency-rule": `
<p class="lead">Clean і Hexagonal архітектури обидві тримають <strong>правило залежностей</strong>: залежності спрямовані <em>всередину</em>, до домену, який не залежить ні від чого.</p>
<ul>
<li><strong>Шари:</strong> Domain (сутності, правила) у центрі → Application (сценарії використання) → адаптери інтерфейсів → Infrastructure (БД, web, зовнішні сервіси) на краю.</li>
<li><strong>Hexagonal (ports &amp; adapters):</strong> домен визначає <em>порти</em> (інтерфейси); <em>адаптери</em> (БД, UI, API) їх реалізують.</li>
<li><strong>Dependency inversion</strong> робить це можливим: внутрішній шар оголошує інтерфейс, зовнішній його реалізує.</li>
</ul>
<p>Дає тестоване, незалежне від фреймворку ядро — ціною додаткових шарів і мапінгу. Варте цього для складних, довговічних доменів; надлишок для простого CRUD.</p>
<div class="say"><strong>Скажіть так:</strong> «Clean і Hexagonal тримають правило залежностей — залежності йдуть усередину, до домену, що не залежить ні від чого. Домен і сценарії в центрі; БД, web і зовнішні сервіси — адаптери на краю, що реалізують порти домену. Dependency inversion робить це можливим: внутрішній шар оголошує інтерфейс, зовнішній реалізує. Виходить тестоване, незалежне від фреймворку ядро — ціною шарів і мапінгу. Варте для складних доменів, надлишок для простого CRUD».</div>
`,

"oop-solid-design-patterns__ddd-building-blocks-you-should-name": `
<p class="lead">Тактичні будівельні блоки DDD, які варто назвати:</p>
<ul>
<li><strong>Entity (сутність):</strong> ідентичність + життєвий цикл (Order).</li>
<li><strong>Value Object (об'єкт-значення):</strong> визначається своїми значеннями, незмінний, без ідентичності (Money, Address).</li>
<li><strong>Aggregate (агрегат):</strong> кластер сутностей/value objects із <em>коренем</em>, який тримає інваріанти і є єдиною точкою входу — межа узгодженості й транзакції.</li>
<li><strong>Repository:</strong> абстракція збереження для кореня агрегату.</li>
<li><strong>Domain Service:</strong> логіка, що не лягає на одну сутність.</li>
<li><strong>Domain Event:</strong> сталося щось значуще.</li>
</ul>
<p><strong>Стратегічні:</strong> Bounded Context (межа моделі), Ubiquitous Language (спільний словник). Агрегат — центральне поняття.</p>
<div class="say"><strong>Скажіть так:</strong> «Будівельні блоки DDD: сутності мають ідентичність і життєвий цикл; value objects незмінні й визначаються значеннями, як Money; агрегат — кластер із коренем, що тримає інваріанти і є єдиною точкою входу, тобто межа узгодженості й транзакції; репозиторії зберігають корені агрегатів; domain services тримають логіку, що не належить одній сутності; domain events фіксують, що щось сталося. Стратегічно — bounded context обмежує модель, а ubiquitous language є спільним словником. Агрегат центральний».</div>
`,

"oop-solid-design-patterns__ddd-depth-aggregates-bounded-contexts-domain-events-ubiquitous-languag": `
<p class="lead">Глибше про чотири ключові поняття DDD.</p>
<ul>
<li><strong>Aggregate = межа узгодженості:</strong> тримайте всі його інваріанти в <em>одній транзакції</em>; посилайтеся на інші агрегати за <strong>id</strong>, а не прямим посиланням; тримайте агрегати малими (в ідеалі один агрегат на транзакцію).</li>
<li><strong>Bounded Context:</strong> межа, у якій модель і мова узгоджені. «Customer» означає різне в sales і billing, тож кожен контекст має власну модель, інтегровану через <strong>context mapping</strong> (anti-corruption layer, shared kernel). Часто збігається з межею сервісу.</li>
<li><strong>Domain Events:</strong> фіксують події (OrderPlaced), щоб розв'язати побічні ефекти й забезпечити eventual consistency між агрегатами/контекстами.</li>
<li><strong>Ubiquitous Language:</strong> спільний, точний словник між розробниками й експертами домену, відображений у коді.</li>
</ul>
<div class="say"><strong>Скажіть так:</strong> «Агрегат — межа узгодженості: його інваріанти я тримаю в одній транзакції, а на інші агрегати посилаюся за id, тримаючи агрегати малими. Bounded context обмежує, де модель і мова узгоджені — «Customer» різний у sales і billing — тож у кожного власна модель, інтегрована через context mapping, як anti-corruption layer, часто це межа сервісу. Domain events фіксують події на кшталт OrderPlaced, щоб розв'язати побічні ефекти й дати eventual consistency. Ubiquitous language — спільний словник, відображений у коді».</div>
`,

"oop-solid-design-patterns__repository-unit-of-work-with-ef-still-needed": `
<p class="lead"><code>DbContext</code> у EF Core <em>вже є</em> Unit of Work (відстежує зміни, <code>SaveChanges</code> = одна транзакція), а <code>DbSet&lt;T&gt;</code> <em>вже є</em> репозиторієм (колекція для запитів).</p>
<div class="warn">Тож обгортання EF у власний загальний <code>Repository&lt;T&gt;</code> + <code>UnitOfWork</code> зазвичай <strong>зайве й протікає</strong> — воно ховає сильні сторони EF (Include, проєкції, async) за гіршою абстракцією.</div>
<p>Додавайте репозиторій лише заради <strong>незалежності від збереження</strong> у Clean-архітектурі — і тоді <em>конкретний</em> репозиторій, що повертає доменні об'єкти й інкапсулює змістовні запити, а не загальну CRUD-обгортку. За замовчуванням просто використовуйте <code>DbContext</code>.</p>
<div class="say"><strong>Скажіть так:</strong> «DbContext у EF Core вже є Unit of Work, а DbSet вже є репозиторієм, тож обгортка у загальний Repository плюс UnitOfWork зазвичай зайва й протікає — ховає сильні сторони EF, як Include і проєкції, за гіршою абстракцією. Я додаю репозиторій лише заради незалежності від збереження в Clean-архітектурі, і тоді конкретний репозиторій, що повертає доменні об'єкти й інкапсулює змістовні запити, а не загальну CRUD-обгортку. За замовчуванням — просто DbContext».</div>
`,

"oop-solid-design-patterns__strategy-factory-decorator-observer-net-examples": `
<p class="lead">Чотири поширені патерни GoF, кожен відображений на ідіоматичну конструкцію .NET.</p>
<ul>
<li><strong>Strategy:</strong> взаємозамінні алгоритми за інтерфейсом, який ви впроваджуєте — <code>IComparer</code> або <code>IDiscount</code> з реалізаціями (замінює switch; реалізує Open/Closed).</li>
<li><strong>Factory:</strong> інкапсулює створення — Factory Method, або DI-делегат-фабрика <code>Func&lt;T&gt;</code> / <code>IHttpClientFactory</code>.</li>
<li><strong>Decorator:</strong> обгортає об'єкт, прозоро додаючи поведінку через той самий інтерфейс — кешувальний/логувальний декоратор навколо сервісу, або <code>BufferedStream</code> навколо <code>FileStream</code>.</li>
<li><strong>Observer:</strong> публікація-підписка на зміни стану — C# <code>events</code> або <code>IObservable&lt;T&gt;</code> (Rx).</li>
</ul>
<div class="say"><strong>Скажіть так:</strong> «Strategy інкапсулює взаємозамінні алгоритми за інтерфейсом, який ви впроваджуєте — IComparer чи IDiscount — замінюючи switch і реалізуючи Open/Closed. Factory інкапсулює створення — Factory Method або DI-делегат на кшталт Func&lt;T&gt; чи IHttpClientFactory. Decorator обгортає об'єкт, додаючи поведінку через той самий інтерфейс — кешувальний чи логувальний декоратор, або BufferedStream навколо FileStream. Observer — це публікація-підписка на зміни стану — C# events або IObservable з Rx».</div>
`,

"oop-solid-design-patterns__gof-patterns-beyond-those-creational-structural-behavioral": `
<p class="lead">23 патерни Gang of Four у трьох сімействах — важливий <em>намір</em>, а не зазубрювання.</p>
<ul>
<li><strong>Creational</strong> (створення об'єктів): Singleton, Factory Method, Abstract Factory, Builder, Prototype.</li>
<li><strong>Structural</strong> (компонування об'єктів): Adapter (несумісні інтерфейси), Facade (спрощення підсистеми), Proxy (контроль доступу), Composite (дерева «частина-ціле»), Bridge, Flyweight.</li>
<li><strong>Behavioral</strong> (взаємодія): Strategy, Observer, Command (інкапсуляція запиту — undo/черга), Chain of Responsibility (ланцюг обробників — як middleware), State, Template Method, Iterator, Mediator, Visitor.</li>
</ul>
<p>Багато з них вбудовані в .NET: Iterator = <code>IEnumerable</code>, Observer = events, Command = делегат.</p>
<div class="say"><strong>Скажіть так:</strong> «23 патерни GoF діляться на creational — Singleton, Factory, Builder; structural — Adapter для несумісних інтерфейсів, Facade для спрощення підсистеми, Proxy для контролю доступу, Composite для дерев; і behavioral — Strategy, Observer, Command для undo чи черги, Chain of Responsibility як middleware, State, Iterator, Mediator. Багато вбудовані в .NET — Iterator це IEnumerable, Observer це events, Command це делегат. Я дивлюся на намір і беру патерн лише коли він розв'язує реальну проблему».</div>
`,

"oop-solid-design-patterns__mediator-mediatr-in-process-cqrs": `
<p class="lead">Патерн <strong>Mediator</strong> розв'язує зв'язність компонентів, спрямовуючи їхнє спілкування через посередника замість прямих викликів. <strong>MediatR</strong> — популярна бібліотека .NET.</p>
<ul>
<li>Контролер <strong>надсилає</strong> команду чи запит; <strong>один обробник</strong> його обробляє — це дає in-process <strong>CQRS</strong> (окремі обробники читання й запису) і тонкі контролери.</li>
<li><strong>Pipeline behaviors</strong> обгортають обробники для наскрізних задач (валідація, логування, транзакції) — як middleware.</li>
</ul>
<div class="warn"><strong>Критика:</strong> непряма «магія», яку важко відстежувати, і надлишок для простих застосунків. Беріть для середніх і більших застосунків, яким потрібне чисте розділення.</div>
<div class="say"><strong>Скажіть так:</strong> «Mediator розв'язує зв'язність, спрямовуючи спілкування через посередника замість прямих викликів. MediatR — бібліотека .NET: контролер надсилає команду чи запит, і один обробник його обробляє, даючи in-process CQRS з окремими обробниками читання й запису та тонкими контролерами. Pipeline behaviors обгортають обробники для наскрізних задач, як валідація й транзакції, подібно до middleware. Критика — непрямість, яку важко відстежувати, тож беру для середніх і більших застосунків, а для простого CRUD пропускаю».</div>
`,

"oop-solid-design-patterns__di-done-right-the-service-locator-anti-pattern": `
<p class="lead"><strong>Правильний DI = constructor injection:</strong> клас оголошує залежності як параметри конструктора (інтерфейси), а контейнер їх надає — залежності <em>явні</em>, клас чесний щодо того, що йому потрібно, і легко тестується з моками.</p>
<div class="warn"><strong>Антипатерн service locator:</strong> клас сам просить залежності в контейнера під час виконання (<code>provider.GetService&lt;T&gt;()</code>). Це ховає залежності (конструктор бреше), зв'язує з контейнером і відкладає помилки на runtime.</div>
<p>Тримайте контейнер у <strong>composition root</strong>, де збирається граф об'єктів; ніколи не впроваджуйте <code>IServiceProvider</code> у бізнес-класи.</p>
<div class="say"><strong>Скажіть так:</strong> «Правильний DI — це constructor injection: клас оголошує залежності як параметри конструктора, а контейнер їх надає, тож залежності явні, клас чесний, і його легко тестувати з моками. Антипатерн service locator — клас сам просить залежності в контейнера під час виконання, що їх ховає, зв'язує з контейнером і відкладає помилки на runtime. Я тримаю контейнер у composition root і ніколи не впроваджую IServiceProvider у бізнес-класи».</div>
`,

"oop-solid-design-patterns__composition-over-inheritance": `
<p class="lead">Надавайте перевагу побудові поведінки через <strong>композицію</strong> об'єктів (has-a) над <strong>успадкуванням</strong> від базового класу (is-a).</p>
<h2>Чому</h2>
<ul>
<li>Успадкування жорстко зв'язує підкласи з <strong>крихким базовим класом</strong> — зміна бази ламає підкласи.</li>
<li>Ієрархія жорстка й фіксована на етапі компіляції; глибокі ієрархії важко читати; легко порушити Liskov підкласом, що насправді не замінює базу.</li>
<li>Композиція впроваджує співавторів/стратегії, тож ви поєднуєте малі сфокусовані частини й змінюєте поведінку під час виконання.</li>
</ul>
<p>Використовуйте успадкування лише для справжнього is-a зі стабільною базою й реальною замінністю; композицію — для повторного використання й гнучкості, тобто здебільшого.</p>
<div class="say"><strong>Скажіть так:</strong> «Я надаю перевагу композиції — поєднанню об'єктів — над успадкуванням. Успадкування зв'язує підкласи з крихкою базою, ієрархія жорстка й фіксована на компіляції, і легко порушити Liskov підкласом, що не замінює базу. Композиція впроваджує співавторів і стратегії, тож я поєдную малі сфокусовані частини й змінюю поведінку під час виконання. Успадкування беру лише для справжнього is-a зі стабільною базою й реальною замінністю, а композицію — для повторного використання й гнучкості, тобто здебільшого».</div>
`,

"oop-solid-design-patterns__anti-corruption-layer-null-object-result-option": `
<p class="lead">Три корисні патерни.</p>
<ul>
<li><strong>Anti-corruption layer:</strong> шар трансляції між вашим чистим доменом і зовнішньою/застарілою системою, щоб їхня модель і дивацтва не протікали у вашу — ви транслюєте на межі (context mapping у DDD).</li>
<li><strong>Null Object:</strong> повертайте об'єкт-«нічого-не-роблю», що реалізує інтерфейс із нейтральною поведінкою, замість <code>null</code> — виклики не роблять перевірок на null і не ризикують NRE.</li>
<li><strong>Result / Option:</strong> повертайте <code>Result&lt;T&gt;</code> (успіх/невдача + помилка) або <code>Option&lt;T&gt;</code> (some/none) замість винятків на <em>очікувані</em> невдачі чи null — результат стає явним у типі й змушує викликача його обробити.</li>
</ul>
<div class="say"><strong>Скажіть так:</strong> «Anti-corruption layer транслює між моїм чистим доменом і зовнішньою чи застарілою системою, щоб їхні дивацтва не протікали в мою. Патерн Null Object повертає об'єкт-«нічого-не-роблю», що реалізує інтерфейс, замість null, тож виклики не перевіряють на null і не ризикують NRE. Тип Result чи Option повертає успіх-або-невдачу, чи some-або-none, замість винятку на очікувану невдачу чи null — результат стає явним у типі й змушує викликача його обробити, уникаючи винятків як керування потоком».</div>
`,

"oop-solid-design-patterns__when-you-should-not-apply-a-pattern-overengineering": `
<p class="lead">Патерн розв'язує <em>конкретну</em> проблему, тож застосування без цієї проблеми лише додає складності — <strong>оверинжиніринг</strong>.</p>
<h2>Не застосовуйте патерн, коли</h2>
<ul>
<li>Немає реальної варіативності, від якої захищатися (Strategy/Factory заради єдиної реалізації — YAGNI).</li>
<li>Це простий CRUD-застосунок, якому не потрібні Clean-архітектура, CQRS чи репозиторії.</li>
<li>Ви додаєте його, бо це «best practice», а не щоб зняти біль.</li>
</ul>
<p><strong>Ознаки:</strong> інтерфейси з єдиною реалізацією, прохідні шари, передчасна генералізація, «суп із патернів». Вводьте патерн, коли біль <strong>реальний і повторюваний</strong> (правило трьох); тримайте KISS/YAGNI за замовчуванням.</p>
<div class="say"><strong>Скажіть так:</strong> «Патерн розв'язує конкретну проблему, тож застосування без неї лише додає складності — оверинжиніринг. Я не беру Strategy чи Factory за єдиної реалізації, не ставлю Clean-архітектуру чи CQRS на простий CRUD, і не додаю патерн, бо це «best practice», а не щоб зняти біль. Ознаки — інтерфейси з єдиною реалізацією, прохідні шари, передчасна генералізація. Я вводжу патерн, коли біль реальний і повторюваний — правило трьох — і тримаю KISS та YAGNI за замовчуванням».</div>
`,

"caching-strategies__cache-aside-lazy-loading-read-on-miss-load-populate": `
<p class="lead">Кешем керує застосунок. Читання спершу перевіряє кеш; при промаху застосунок завантажує дані з бази, записує значення назад із TTL і повертає його. Це патерн кешування за замовчуванням у .NET.</p>

<h2>Як це працює</h2>
<p>Три кроки на читання та інвалідація на запис. Кеш ніколи не звертається до бази — ваш код керує обома.</p>
<pre><code>// READ
var cached = await _cache.StringGetAsync(key);
if (cached.HasValue) return Deserialize(cached);   // cache hit
var data = await _db.LoadAsync(id);                 // miss -> source of truth
await _cache.StringSetAsync(key, Serialize(data), ttl);  // populate + TTL
return data;

// WRITE (prefer delete over update-in-place)
await _db.SaveAsync(entity);
await _cache.KeyDeleteAsync(key);   // next read repopulates fresh</code></pre>

<h2>Чому це варіант за замовчуванням</h2>
<ul>
<li><strong>Стійкість:</strong> якщо кеш недоступний, читання просто йдуть напряму до БД — збій кешу не є збоєм даних.</li>
<li><strong>Кешується лише те, що використовують:</strong> холодні дані не займають пам'ять.</li>
<li><strong>Проста ментальна модель:</strong> кеш — це ліниво заповнювана копія, а БД — джерело правди.</li>
</ul>

<h2>Компроміси та підводні камені</h2>
<ul>
<li><strong>Холодний старт / промах на першому читанні:</strong> найперший запит ключа завжди платить вартість звернення до БД. За бажанням прогрівайте гарячі ключі на старті.</li>
<li><strong>Застарілість:</strong> обмежена TTL. Скорочуйте TTL або інвалідуйте на запис задля свіжості.</li>
<li><strong>Гонка подвійного запису:</strong> якщо на запис ви <em>оновлюєте</em> кеш (замість видалення), паралельне читання може перезаписати застаріле значення після вашого оновлення. <strong>Видаляйте ключ</strong> і дайте наступному читанню його перебудувати.</li>
<li><strong>Stampede:</strong> коли гарячий ключ протермінується, тисячі паралельних промахів одночасно б'ють по БД — див. cache stampede / breakdown.</li>
</ul>

<div class="say"><strong>Скажіть так:</strong> «За замовчуванням я беру cache-aside. На запис я видаляю ключ, а не оновлюю його на місці — видалення уникає гонки втраченого оновлення між моїм записом і паралельним читанням, — а гарячі ключі захищаю від stampede поключовим локом перебудови плюс jitter для TTL».</div>

<h2>Можливі додаткові питання</h2>
<ul>
<li>Видаляти чи оновлювати кеш на запис? (видаляти — уникає гонки застарілого перезаповнення)</li>
<li>Як уникнути stampede при протермінуванні? (поключовий лок / single-flight, stale-while-revalidate, TTL із jitter)</li>
<li>Cache-aside проти read-through? (хто містить логіку завантаження — ваш застосунок чи бібліотека кешу)</li>
</ul>
`,

"caching-strategies__read-through-the-cache-loads-from-db-on-a-miss": `
<p class="lead">Той самий шлях читання, що й у cache-aside, але з бази при промаху завантажує <em>шар кешу</em> (провайдер/бібліотека), а не код застосунку. Викликач просто просить кеш і завжди отримує значення.</p>

<h2>Чим відрізняється від cache-aside</h2>
<p>У cache-aside логіку «при промаху завантаж із БД і заповни» містить застосунок. У read-through ця логіка живе за абстракцією кешу (API в стилі <code>GetOrCreate</code> або окремий продукт кешування). Зовнішня поведінка майже ідентична; різниця в тому, <em>де живе код завантаження</em>.</p>
<pre><code>// Read-through style: the factory is the "load from source" logic,
// invoked by the cache only on a miss.
var data = await _cache.GetOrCreateAsync(key, async entry =&gt; {
    entry.AbsoluteExpirationRelativeToNow = ttl;
    return await _db.LoadAsync(id);
});</code></pre>
<p>У .NET <code>IMemoryCache.GetOrCreateAsync</code> і <code>HybridCache</code> (.NET 9) дають семантику read-through; розподілені кеші на кшталт NCache пропонують справжній read-through із провайдером, який ви реєструєте.</p>

<h2>Компроміси</h2>
<table>
<tr><th></th><th>Cache-aside</th><th>Read-through</th></tr>
<tr><td>Логіка завантаження</td><td>У застосунку</td><td>За кешем</td></tr>
<tr><td>Узгодженість доступу</td><td>Кожне місце виклику має пам'ятати патерн</td><td>Централізовано — один шлях коду</td></tr>
<tr><td>Зв'язність</td><td>Застосунок знає БД</td><td>Кеш знає БД (провайдер)</td></tr>
</table>
<ul>
<li><strong>Плюс:</strong> одне місце для логіки завантаження + заповнення; місця виклику не можуть забути заповнити.</li>
<li><strong>Мінус:</strong> зв'язує шар кешу з джерелом даних; важче застосувати налаштування під конкретний запит.</li>
<li>Ті самі питання свіжості/stampede, що й у cache-aside — провайдер із вбудованим single-flight допомагає.</li>
</ul>

<div class="say"><strong>Скажіть так:</strong> «Read-through — це cache-aside із логікою завантаження, перенесеною в шар кешу; головний виграш у тім, що жодне місце виклику не може забути заповнити. У .NET я отримую це від <code>GetOrCreateAsync</code> чи <code>HybridCache</code>, який ще й дедуплікує паралельні промахи».</div>
`,

"caching-strategies__write-through-write-cache-db-synchronously": `
<p class="lead">На запис кеш і база оновлюються <em>синхронно</em> в одній операції. Кеш завжди узгоджений із БД для записаних ключів — ціною затримки запису.</p>

<h2>Як це працює</h2>
<pre><code>// Write-through: both stores updated before returning
await _db.SaveAsync(entity);
await _cache.StringSetAsync(key, Serialize(entity), ttl);
// read is now guaranteed to hit a fresh value</code></pre>
<p>Часто поєднується з read-through: записи тримають кеш свіжим, читання обслуговуються з нього. Добре, коли ті самі записи читають скоро й часто після запису.</p>

<h2>Компроміси</h2>
<ul>
<li><strong>Плюс:</strong> кеш ніколи не віддає застаріле записане значення; читання одразу після запису — теплі.</li>
<li><strong>Мінус:</strong> кожен запис платить два звернення (БД + кеш) → вища затримка запису.</li>
<li><strong>Мінус:</strong> кешуються дані, які, можливо, більше ніколи не прочитають (write amplification / забруднення).</li>
<li><strong>Небезпека узгодженості:</strong> два сховища, жодної розподіленої транзакції — якщо запис у кеш провалиться після коміту в БД, вони розійдуться. Пом'якшуйте: пишіть спершу в БД, потім <em>видаляйте</em> ключ (деградація до cache-aside) замість запису можливо застарілого значення, або прийміть короткий TTL як підстраховку.</li>
</ul>

<div class="say"><strong>Скажіть так:</strong> «Write-through купує узгодженість read-after-write ціною затримки запису. Оскільки транзакції між БД і кешем немає, я спершу комічу БД, а запис у кеш вважаю best-effort — при збої видаляю ключ, щоб наступне читання його перебудувало».</div>

<h2>Коли це обирати</h2>
<p>Дані з перевагою читання, які читають знову скоро після кожного запису (профіль користувача, конфіг). Уникайте для даних із перевагою запису, які рідко перечитують — ви лише забруднюватимете кеш.</p>
`,

"caching-strategies__write-behind-write-back-async-flush-to-db": `
<p class="lead">Пишіть у кеш негайно й підтверджуйте викликачу; у базу скидайте <em>асинхронно</em> пізніше (пакетно/об'єднано). Найшвидші записи, але ви ризикуєте втратити нескинуті дані, якщо кеш впаде.</p>

<h2>Як це працює</h2>
<p>Запис повертається, щойно кеш оновлено. Фоновий процес зливає чергу «брудних» записів у БД — часто <strong>об'єднуючи</strong> багато оновлень того самого ключа в один запис і <strong>пакетуючи</strong> між ключами.</p>
<pre><code>// write path: update cache, enqueue the DB flush, return
await _cache.StringSetAsync(key, Serialize(entity), ttl);
_flushChannel.Writer.TryWrite(entity.Id);   // async, batched drain elsewhere</code></pre>

<h2>Компроміси</h2>
<ul>
<li><strong>Плюс:</strong> дуже низька затримка запису; поглинає сплески записів; пакетування/об'єднання різко зрізає навантаження на БД (чудово для лічильників, метрик, «last seen»).</li>
<li><strong>Мінус — надійність:</strong> підтверджені користувачу, але ще не скинуті дані <em>втрачаються</em>, якщо вузол кешу впаде до скидання. Використовуйте лише там, де така втрата прийнятна, або підстрахуйте надійним логом.</li>
<li><strong>Мінус — складність:</strong> порядок, повтори та обробка збоїв асинхронного скидання; читання з БД можуть відставати від кешу.</li>
</ul>

<div class="say"><strong>Скажіть так:</strong> «Write-behind міняє надійність на швидкість запису — я взяв би його для об'ємних даних, втрату яких можна стерпіти, як-от лічильники переглядів чи "last active", з об'єднанням, щоб тисяча інкрементів стала одним записом у БД. Для того, що не можна втратити, write-behind не використовую».</div>

<h2>Шпаргалка по стратегіях</h2>
<table>
<tr><th>Патерн</th><th>Свіжість</th><th>Вартість запису</th><th>Ризик</th></tr>
<tr><td>Cache-aside</td><td>обмежена TTL</td><td>низька</td><td>застарілість / stampede</td></tr>
<tr><td>Write-through</td><td>завжди свіжа</td><td>висока (2 записи)</td><td>забруднення</td></tr>
<tr><td>Write-behind</td><td>свіжа в кеші</td><td>найнижча</td><td>втрата даних при краху</td></tr>
</table>
`,

"redis-caching-problems__redis-unavailable-at-peak-fail-open-vs-fail-closed": `
<p class="lead">Redis — спільна залежність (L2-кеш, локи, rate limits). Якщо він недоступний, кожен виклик, що його торкається, блокується на таймауті або кидає виняток. Питання дизайну — чи кожне використання <strong>fail-open</strong> (продовжити без Redis), чи <strong>fail-closed</strong> (відхилити).</p>

<h2>Небезпека: перетворити збій кешу на повний збій</h2>
<p>Якщо читання просто йдуть напряму до БД, збій Redis відправляє <em>весь</em> трафік у базу одночасно (thundering herd). Таймаути накопичуються, пул потоків виснажується, і весь сервіс деградує — збій кешу каскадує.</p>

<h2>Вирішуйте fail-open проти fail-closed для кожного випадку</h2>
<ul>
<li><strong>Кешування → fail open.</strong> Короткі таймаути з'єднання/команди, трактуйте помилку Redis як промах кешу, обслуговуйте з БД. Захистіть БД об'єднувачем запитів (single-flight) і невеликим внутрішньопроцесним L1, щоб herd був обмежений.</li>
<li><strong>Розподілений лок / rate limiter → fail closed (або свідома деградація).</strong> Тихе пропускання лока ламає коректність; тихе пропускання лімітера відкриває двері зловживанню. Відхиляйте або переходьте на консервативний локальний лімітер.</li>
</ul>

<h2>Механіка</h2>
<pre><code>try {
    var v = await _cache.StringGetAsync(key);   // short timeouts configured
    if (v.HasValue) return Deserialize(v);
}
catch (RedisException) { /* fail open: fall through to DB */ }

return await _coalescer.GetOrLoadAsync(key, () =&gt; _db.LoadAsync(id));</code></pre>
<p>Обгортайте виклики Redis у <strong>circuit breaker</strong> (Polly), щоб перестати довбати мертвий вузол, і додайте <strong>локальний fallback</strong> (in-memory лімітер/кеш) для випадків fail-closed.</p>

<div class="say"><strong>Скажіть так:</strong> «Я вирішую fail-open проти fail-closed поключово: кеш — fail open, локи та лімітери — fail closed. Короткі таймаути я поєдную з circuit breaker та об'єднанням запитів, щоб збій Redis не став stampede по базі».</div>

<h2>Можливі додаткові питання</h2>
<ul>
<li>Як зупинити herd по БД, коли Redis падає? (об'єднання + L1 + circuit breaker)</li>
<li>Чому не fail-open на локі? (втратили б взаємне виключення → подвійна обробка)</li>
</ul>
`,

"redis-caching-problems__cache-aside-avoiding-a-stampede": `
<p class="lead">Stampede (dogpile / thundering herd) трапляється, коли гарячий ключ протермінувався і тисячі паралельних запитів усі промахуються й перебудовують його з БД тієї самої миті. Виправлення: нехай <em>один</em> викликач перебудовує, поки решта чекає або віддає застаріле.</p>

<h2>Три виправлення — поєднуйте їх</h2>
<ol>
<li><strong>Single-flight / поключовий лок перебудови.</strong> Перебудовує лише один викликач; решта чекає результату або отримує попереднє значення. Між репліками використовуйте короткий Redis-лок (<code>SET key token NX PX</code>); у межах одного процесу — <code>SemaphoreSlim</code> на запис.</li>
<li><strong>Stale-while-revalidate.</strong> Віддавайте старе значення після протермінування й оновлюйте у фоні, щоб жоден запит не блокувався на перебудові.</li>
<li><strong>TTL із jitter.</strong> Додайте випадковість до термінів, щоб багато ключів не вмирали на одному тику (це виправлення для <em>avalanche</em>).</li>
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

<div class="warn"><strong>Ключова думка:</strong> <code>SemaphoreSlim</code> координує задачі лише <em>всередині одного процесу</em>. З кількома репліками ви однаково отримаєте одну перебудову <em>на репліку</em>, якщо лок не живе в Redis (<code>SET NX</code>).</div>

<div class="say"><strong>Скажіть так:</strong> «Stampede — це протермінування гарячого ключа під конкурентністю. Я поєдную поключову перебудову single-flight, stale-while-revalidate, щоб читачі не блокувались, і TTL із jitter. Нюанс: внутрішньопроцесний семафор дає одну перебудову на репліку; щоб була одна перебудова на весь кластер, лок має бути в Redis».</div>
`,

"redis-caching-problems__distributed-lock-with-redis-pitfalls-fencing": `
<p class="lead">Беріть лок через <code>SET key uniqueToken NX PX 30000</code> — атомарне «встанови, якщо не існує» з терміном життя. Токен доводить володіння; звільняйте через compare-and-delete на Lua. Пастка — у TTL: якщо робота переживе його, двоє воркерів працюватимуть одночасно.</p>

<h2>Взяття та звільнення</h2>
<pre><code>// acquire: NX = only if absent, PX = expiry in ms, token = ownership proof
bool ok = await db.StringSetAsync(key, token, TimeSpan.FromSeconds(30),
                                  When.NotExists);

// release: delete ONLY if the value is still our token (atomic, in Lua)
const string unlock = @"if redis.call('get', KEYS[1]) == ARGV[1]
                        then return redis.call('del', KEYS[1]) else return 0 end";
await db.ScriptEvaluateAsync(unlock, new RedisKey[]{key}, new RedisValue[]{token});</code></pre>

<h2>Що йде не так</h2>
<ul>
<li><strong>Протермінування оренди посеред роботи:</strong> якщо робота триває довше за TTL, лок протермінується, інший воркер його бере, і тепер двоє працюють паралельно. Тримайте роботу коротшою за TTL або запустіть <strong>watchdog</strong>, що продовжує (розширює) оренду, поки живий.</li>
<li><strong>Видалення чужого лока:</strong> наївний <code>DEL</code> при звільненні може видалити лок, яким уже володіє інший. Завжди робіть compare-and-delete за токеном (Lua вище).</li>
<li><strong>Failover:</strong> однонодовий лок може втратити взаємне виключення під час перемикання primary (новий primary ще не отримав ключ).</li>
</ul>

<h2>Fencing-токени — справжня безпека</h2>
<p>Лок дає взаємне виключення <em>лише якщо ніщо не працює довше за TTL</em>. Для критичних до коректності записів видавайте разом із локом монотонно зростаючий <strong>fencing-токен</strong> і нехай захищений ресурс відхиляє будь-який запис із токеном, нижчим за найбільший бачений. Так пізній запис застарілого власника лока буде відхилено, навіть якщо той досі «думає», що тримає лок.</p>

<div class="warn"><strong>Дискусія про Redlock:</strong> багатонодовий алгоритм Redlock додає доступність, але його коректність за умов розходження годинників / пауз GC є спірною (Kleppmann). Для більшості потреб застосунку однонодовий лок + fencing-токен простіший і безпечніший. Справжня коректність живе на ресурсі, а не на локі.</div>

<div class="say"><strong>Скажіть так:</strong> «SET NX PX з унікальним токеном, звільнення через compare-and-delete на Lua, продовження watchdog'ом для довгої роботи. Але лок гарантує виключення лише якщо ніщо не переповзає TTL — саме fencing-токени, перевірені на ресурсі, роблять його справді безпечним».</div>
`,

"redis-caching-problems__concurrent-key-update-atomic-ops-watch-multi-lua": `
<p class="lead">Кожна <em>команда</em> Redis атомарна (однопотоковий сервер), але read-modify-write у <em>вашому застосунку</em> — ні: два клієнти GET те саме значення, змінюють і SET — другий перезаписує перший (втрачене оновлення). Виправлення: зробіть мутацію атомарною на сервері.</p>

<h2>Три способи зробити це безпечно</h2>
<ul>
<li><strong>Атомарні серверні операції:</strong> перенесіть мутацію в Redis. <code>INCR</code>/<code>INCRBY</code>/<code>HINCRBY</code> для лічильників; команди set/hash/sorted-set замість перезапису блоба. Найшвидше й найпростіше — гонки взагалі немає.</li>
<li><strong>Lua-скрипт:</strong> read + modify + write в одному атомарному серверному кроці для логіки, під яку в Redis немає окремої команди. Тримайте його коротким (він блокує єдиний потік).</li>
<li><strong>Оптимістична конкурентність через <code>WATCH</code> + <code>MULTI</code>/<code>EXEC</code>:</strong> слідкуйте за ключем; транзакція скасовується, якщо він змінився до <code>EXEC</code>; ви повторюєте.</li>
</ul>

<pre><code>// BAD: read-modify-write in the app -> lost update under concurrency
var n = (int)await db.StringGetAsync(key);
await db.StringSetAsync(key, n + 1);

// GOOD: atomic on the server
await db.StringIncrementAsync(key);        // INCR
await db.HashIncrementAsync(h, "f", 1);    // HINCRBY</code></pre>

<table>
<tr><th>Підхід</th><th>Найкраще для</th><th>Вартість</th></tr>
<tr><td>Атомарна операція (INCR, ZADD…)</td><td>лічильники, set, sorted set</td><td>найдешевше, без повторів</td></tr>
<tr><td>Lua-скрипт</td><td>власний read-modify-write</td><td>гнучко; блокує потік — тримайте коротким</td></tr>
<tr><td>WATCH/MULTI/EXEC</td><td>загальне оптимістичне оновлення</td><td>може зациклитись (livelock) за високої конкуренції</td></tr>
</table>

<div class="say"><strong>Скажіть так:</strong> «Окремі команди атомарні, але read-modify-write мого застосунку — ні, це втрачене оновлення. Я переношу мутацію на сервер: INCR/HINCRBY для лічильників, короткий Lua-скрипт для власної логіки або WATCH/MULTI/EXEC для оптимістичних оновлень із повтором».</div>
`,

"redis-caching-problems__redis-transactions-multi-exec-watch-lua-scripts": `
<p class="lead">Транзакції Redis — не як у SQL. <code>MULTI</code>…<code>EXEC</code> ставить команди в чергу й виконує їх атомарно та в ізоляції — але <strong>відкату немає</strong>. <code>WATCH</code> додає оптимістичну конкурентність; Lua-скрипти — це практична «збережена процедура».</p>

<h2>MULTI / EXEC</h2>
<ul>
<li>Команди між <code>MULTI</code> і <code>EXEC</code> <strong>ставляться в чергу</strong>, потім виконуються підряд без вклинювання інших клієнтів (ізоляція).</li>
<li><strong>Відкату немає:</strong> якщо команда впаде під час виконання (напр., неправильний тип), решта все одно виконається. Redis вважає такі збої помилкою програміста, а не причиною відкотити.</li>
<li><code>DISCARD</code> відкидає чергову транзакцію до <code>EXEC</code>.</li>
</ul>

<h2>WATCH — оптимістична конкурентність</h2>
<pre><code>WATCH balance
val = GET balance            // read
if (val &lt; amount) { UNWATCH; return insufficient; }
MULTI
DECRBY balance amount         // queued
EXEC                          // nil if 'balance' changed since WATCH -&gt; retry</code></pre>
<p><code>EXEC</code> повертає nil (транзакцію скасовано), якщо будь-який відстежуваний ключ змінив хтось інший між <code>WATCH</code> і <code>EXEC</code>. Ви робите цикл і повторюєте — класичний compare-and-swap.</p>

<h2>Lua-скрипти (EVAL)</h2>
<p>Скрипт виконується атомарно та в ізоляції на єдиному серверному потоці, з повною логікою read-modify-write та умовами. Зазвичай простіше й швидше за цикли WATCH-retry та уникає зайвих звернень. Тримайте скрипти короткими — довгий скрипт блокує кожного іншого клієнта. Скрипти кешуються за SHA (<code>EVALSHA</code>).</p>

<div class="say"><strong>Скажіть так:</strong> «MULTI/EXEC у Redis дає атомарність та ізоляцію, але без відкату — команди, що впали, не скасовують решту. Для умовної логіки я віддаю перевагу короткому Lua-скрипту (атомарний, одне звернення) над циклом WATCH/EXEC, який може зациклитись за конкуренції».</div>
`,

"redis-caching-problems__stackexchange-redis-correct-usage-singleton-multiplexer-timeouts": `
<p class="lead"><code>ConnectionMultiplexer</code> дорогий, потокобезпечний і мультиплексує всі команди через кілька з'єднань. Створюйте його <strong>один раз</strong> як singleton. Створення одного на запит вичерпує сокети й руйнує продуктивність.</p>

<h2>Правила</h2>
<ul>
<li><strong>Singleton-мультиплексор.</strong> Реєструйте <code>IConnectionMultiplexer</code> раз у DI; беріть дешевий <code>IDatabase</code> на операцію.</li>
<li><strong>Віддавайте перевагу async</strong> (<code>StringGetAsync</code>) — синхронні виклики під навантаженням спричиняють таймаути й тиск на пул потоків.</li>
<li><strong>Задавайте розумні таймаути</strong> (connect, sync/async op), щоб повільний Redis падав швидко, а не вішав потоки.</li>
<li><strong>Обробляйте <code>RedisConnectionException</code> / <code>RedisTimeoutException</code></strong> як промах кешу (fail open) за circuit breaker.</li>
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

<div class="warn"><strong>Неочевидна причина таймаутів Redis:</strong> дуже часто це <em>не</em> Redis. Sync-over-async деінде в застосунку (<code>.Result</code>, <code>.Wait()</code>) виснажує пул потоків, що затримує колбеки завершення StackExchange.Redis — і спливає як <code>RedisTimeoutException</code>. Виправляйте блокуючі виклики, а не Redis.</div>

<div class="say"><strong>Скажіть так:</strong> «Один <code>ConnectionMultiplexer</code> як singleton, async усюди, короткі таймаути, а винятки з'єднання/таймауту трактую як промах кешу. А коли бачу таймаути Redis у проді, насамперед дивлюсь на виснаження пулу потоків на клієнті — це звична причина, а не сервер».</div>
`,

"redis-caching-problems__redis-data-structures-atomic-server-side-commands": `
<p class="lead">Обирайте структуру даних Redis, яка дозволяє серверу виконати вашу операцію <em>атомарно</em>, замість того, щоб читати блоб у застосунок, змінювати його й писати назад (що створює гонку).</p>

<h2>Структура → завдання</h2>
<table>
<tr><th>Структура</th><th>Для чого</th><th>Ключові команди</th></tr>
<tr><td>String</td><td>кешований блоб, лічильник, прапорець</td><td>GET/SET, INCR, SETNX</td></tr>
<tr><td>Hash</td><td>поля об'єкта (оновити одне поле без перезапису всього об'єкта)</td><td>HSET, HGET, HINCRBY</td></tr>
<tr><td>List</td><td>проста черга/стек, стрічка останніх елементів</td><td>LPUSH, RPOP, LRANGE</td></tr>
<tr><td>Set</td><td>унікальне членство, теги, «is online»</td><td>SADD, SISMEMBER, SINTER</td></tr>
<tr><td>Sorted set (ZSET)</td><td>рейтинги, черги пріоритетів, sliding-window rate limits (score = timestamp)</td><td>ZADD, ZRANGE, ZREMRANGEBYSCORE</td></tr>
<tr><td>Bitmap / HyperLogLog</td><td>компактні прапорці; приблизні підрахунки унікальних за крихітної пам'яті</td><td>SETBIT, PFADD, PFCOUNT</td></tr>
<tr><td>Stream</td><td>надійний лог із consumer groups</td><td>XADD, XREADGROUP, XACK</td></tr>
</table>

<h2>Чому це важливо</h2>
<p>Зберігання об'єкта як JSON-<em>String</em> змушує робити read-modify-write, щоб змінити одне поле — це гонка втраченого оновлення та зайвий трафік. Зберігайте як <em>Hash</em> і робіть <code>HINCRBY</code>/<code>HSET</code> одного поля атомарно. Sliding-window rate limiter — це <em>ZSET</em> з timestamp'ами, обрізаний через <code>ZREMRANGEBYSCORE</code> — усе на сервері.</p>

<div class="say"><strong>Скажіть так:</strong> «Головний інстинкт — обрати структуру, яку Redis може мутувати атомарно на сервері: Hash, щоб оновити одне поле, ZSET для рейтингів та sliding-window лімітів, — а не ганяти блоб туди-сюди й створювати гонку на read-modify-write».</div>
`,

"redis-caching-problems__pub-sub-vs-redis-streams": `
<p class="lead">Pub/Sub — fire-and-forget: повідомлення йдуть лише до підписників, під'єднаних <em>прямо зараз</em>, нічого не зберігається. Streams — це append-only лог з ID: повідомлення зберігаються, підтримують consumer groups, підтвердження та відтворення.</p>

<h2>Pub/Sub</h2>
<ul>
<li>Без персистентності, без відтворення, без ack, без consumer groups.</li>
<li>Якщо підписник недоступний або перепідключається, він <strong>пропускає</strong> повідомлення.</li>
<li>Чудово для дешевого, втратного, реального fan-out: сповіщення про інвалідацію кешу між репліками, сигнали присутності.</li>
</ul>

<h2>Streams</h2>
<ul>
<li>Append-only лог; кожен запис має ID. Повідомлення зберігаються (з урахуванням обрізання).</li>
<li><strong>Consumer groups</strong> розподіляють роботу між споживачами; <strong>XACK</strong> підтверджує; <strong>pending-entries list (PEL)</strong> відстежує непідтверджені повідомлення для відновлення після краху; <strong>XCLAIM</strong> перепризначає застряглі.</li>
<li>Відтворення з будь-якого ID; надолуження після простою. Легка черга at-least-once без повноцінного брокера.</li>
</ul>

<table>
<tr><th></th><th>Pub/Sub</th><th>Streams</th></tr>
<tr><td>Доставка</td><td>at-most-once (втратна)</td><td>at-least-once</td></tr>
<tr><td>Персистентність / відтворення</td><td>немає</td><td>є</td></tr>
<tr><td>Consumer groups / ack</td><td>ні</td><td>так</td></tr>
<tr><td>Офлайн-підписник</td><td>пропускає повідомлення</td><td>надолужує</td></tr>
</table>

<div class="say"><strong>Скажіть так:</strong> «Pub/Sub — для дешевого втратного fan-out, як-от міжнодова інвалідація кешу; Streams — коли треба доставка at-least-once, розподіл роботи та надолуження після простою. Але для справжніх гарантій надійності я б узяв Azure Service Bus, а не Redis — вибір правильного інструмента свідчить про розсудливість».</div>
`,

"redis-caching-problems__pipelining-single-threaded-execution-scan-not-keys": `
<p class="lead">Redis виконує команди по одній на єдиному потоці — тому кожна команда атомарна, і тому одна повільна команда блокує всіх. Pipelining ховає мережеву затримку; <code>SCAN</code> замінює блокуючий <code>KEYS</code>.</p>

<h2>Наслідки однопотоковості</h2>
<ul>
<li>Кожна команда атомарна й легка для розуміння — локи на команду не потрібні.</li>
<li>Одна повільна/O(N) команда гальмує весь сервер: <code>KEYS *</code> на великому keyspace, довгий Lua-скрипт, <code>SMEMBERS</code> на величезному set, <code>HGETALL</code> на величезному hash.</li>
<li>Пропускна здатність бере початок з in-memory + pipelining, а не з потоків. (Redis 6+ додав потоковий <em>I/O</em>, але <em>виконання</em> команд досі однопотокове.) Масштабуйте через Cluster, а не більше ядер.</li>
</ul>

<h2>Ніколи не запускайте KEYS у проді</h2>
<p><code>KEYS pattern</code> — це O(N) по всьому keyspace, і він блокує сервер. Використовуйте <strong><code>SCAN</code></strong> — неблокуючий ітератор на курсорі, що повертає ключі маленькими пачками.</p>
<pre><code>// StackExchange.Redis exposes SCAN via server.Keys(...)
var server = mux.GetServer(endpoint);
foreach (var key in server.Keys(pattern: "tenant:42:*", pageSize: 250))
    { /* process incrementally */ }</code></pre>

<h2>Pipelining</h2>
<p>Надсилайте багато команд, не чекаючи на кожну відповідь, потім читайте всі відповіді — згортаючи N звернень у ~1. На реальній мережевій затримці це величезний виграш. Використовуйте <code>MGET</code>/<code>MSET</code> для багатоключових операцій. StackExchange.Redis неявно пайплайнить через мультиплексоване async API; <code>CreateBatch</code>/<code>CreateTransaction</code> групують явно. (Pipelining не атомарний, якщо не обгорнути в MULTI/EXEC.)</p>

<div class="say"><strong>Скажіть так:</strong> «"Мій Redis повільний" зазвичай означає N послідовних звернень, а не Redis — pipelining чи MGET це виправляє. А оскільки Redis однопотоковий, я ніколи не запускаю KEYS у проді; користуюсь SCAN, щоб одна команда не загальмувала сервер».</div>
`,

"redis-caching-problems__eviction-policies-ttl-persistence": `
<p class="lead">Узгоджуйте політику пам'яті з роллю інстансу. Чистий кеш використовує витіснення LRU/LFU і мало чи зовсім без персистентності; сховище локів/черг/джерела правди використовує <code>noeviction</code> та надійну персистентність.</p>

<h2>TTL</h2>
<p>Протермінування на ключ. Ключі кешу майже завжди мусять його мати; <strong>jitter</strong>-уйте їх, щоб багато ключів не протермінувалось на одному тику (запобігає avalanche).</p>

<h2>Витіснення (коли досягнуто <code>maxmemory</code>)</h2>
<table>
<tr><th>Політика</th><th>Поведінка</th><th>Для чого</th></tr>
<tr><td>noeviction</td><td>відхиляти записи (помилка OOM)</td><td>лок / черга / джерело правди</td></tr>
<tr><td>allkeys-lru / allkeys-lfu</td><td>витісняти найдавніше / найрідше вживане</td><td>чистий кеш</td></tr>
<tr><td>volatile-lru / -lfu / -ttl</td><td>витісняти лише ключі, що мають TTL</td><td>змішаний кеш + довговічні ключі</td></tr>
</table>
<p>LFU опирається <em>забрудненню кешу</em> (сплеск разових ключів, що витісняють справді гарячі дані) краще за LRU.</p>

<h2>Персистентність</h2>
<ul>
<li><strong>RDB:</strong> періодичні точкові знімки. Швидкий рестарт, але можна втратити останні кілька хвилин.</li>
<li><strong>AOF:</strong> дописує кожен запис. Надійніше, більший обсяг, повільніше відтворення. Налаштовуваний fsync (everysec — звичний баланс).</li>
<li>Запускайте обидва задля надійності; чистому кешу часто не треба жодного.</li>
</ul>

<div class="say"><strong>Скажіть так:</strong> «Узгоджую політику з роллю: кеш — allkeys-lru (чи lfu) та без персистентності; сховище локів чи streams — noeviction плюс AOF. І кожен ключ кешу отримує TTL із jitter, щоб протермінування не синхронізувались у avalanche».</div>
`,

"redis-caching-problems__cluster-sentinel-replication-failover": `
<p class="lead">Реплікація дає масштабування читань і кандидатів на failover; Sentinel автоматизує failover для одного набору даних; Cluster шардить keyspace по багатьох primary для горизонтального масштабу. Усі три поділяють одну істину: асинхронна реплікація означає, що failover може втратити найновіші записи.</p>

<h2>Реплікація</h2>
<p>Один primary, N реплік (асинхронні за замовчуванням). Репліки обслуговують читання й є кандидатами на failover. Оскільки реплікація асинхронна, записи, підтверджені primary, але ще не доставлені репліці, можуть <strong>загубитись</strong>, якщо primary впаде до реплікації.</p>

<h2>Sentinel</h2>
<p>Набір процесів Sentinel моніторить групу primary/replica, домовляється (кворум), коли primary впав, промотує репліку й дає клієнтам service discovery. <strong>Без шардингу</strong> — це висока доступність для одного набору даних.</p>

<h2>Cluster</h2>
<p>Шардить keyspace по <strong>16384 hash-слотах</strong>, розкиданих по кількох primary (кожен із репліками). Масштабує записи й пам'ять горизонтально. Багатоключові операції мусять потрапити в той самий слот — використовуйте <strong>hash-теги</strong> <code>{...}</code> (напр., <code>user:{42}:profile</code> і <code>user:{42}:cart</code> ділять слот), щоб MGET/транзакції працювали.</p>

<div class="warn"><strong>Вікно збою:</strong> під час failover є коротке вікно, де записи можуть загубитись чи бути відхиленими. Тож клієнтам потрібні повтори, а всьому критичному до коректності (локам) — <strong>fencing-токени</strong>: сам лок через failover небезпечний.</div>

<div class="say"><strong>Скажіть так:</strong> «Реплікація — для масштабу читань і кандидатів HA, Sentinel — щоб автоматизувати failover одного набору даних, Cluster — щоб шардити по 16384 слотах заради горизонтального масштабу. Реплікація асинхронна, тож failover може втратити найсвіжіші записи — мої клієнти повторюють, а локи мають fencing».</div>
`,

"redis-caching-problems__cache-invalidation-stale-data": `
<p class="lead">«У комп'ютерних науках є дві складні речі…» — інвалідація одна з них, бо дві складні частини — це <em>що</em> інвалідувати і <em>коли</em>. Стратегії, приблизно за толерантністю до застарілості:</p>

<h2>Стратегії</h2>
<ul>
<li><strong>Лише TTL:</strong> найпростіше; приймаєте обмежене вікно застарілості. Jitter-уйте TTL, щоб уникнути синхронного протермінування.</li>
<li><strong>Явно на запис:</strong> видаляйте ключ, коли джерело змінюється. <strong>Видалення краще за оновлення на місці</strong> — оновлення може зіткнутись у гонці з паралельним читанням, що перезапише застаріле значення одразу після вашого оновлення.</li>
<li><strong>На подіях:</strong> публікуйте інвалідацію (Redis Pub/Sub або брокер), щоб кожен інстанс скинув свою in-memory копію L1 — необхідно для багаторепліктних внутрішньопроцесних кешів.</li>
<li><strong>Версіоновані / неймспейсовані ключі:</strong> піднімайте версію (<code>user:42:v7:*</code>); старі записи просто покидаються й старіють самі. Чудово для інвалідації цілої групи одразу.</li>
</ul>

<h2>Небезпека порядку подвійного запису</h2>
<p>Оновлення БД і кешу — це дві операції без спільної транзакції. Якщо пишете кеш, потім БД (або оновлюєте кеш значенням, яке пізніше повільніше читання перезапише), можете залишити застарілий запис. Безпечніший порядок: <strong>спершу комітьте БД, потім видаляйте ключ кешу</strong>; наступне читання перебудує з джерела. (Та сама родина небезпек, що й у проблемі outbox/подвійного запису.)</p>

<div class="say"><strong>Скажіть так:</strong> «Я інвалідую видаленням, а не оновленням — видалення уникає гонки застарілого перезаповнення. Для багаторепліктних L1-кешів публікую інвалідації через Pub/Sub, а для групової інвалідації піднімаю версію в неймспейсі ключа. TTL завжди присутній як підстраховка».</div>
`,

"redis-caching-problems__multi-tenant-caching-monitoring": `
<p class="lead">У багатоорендній системі кеш, що повертає дані іншого орендаря, — це <strong>витік даних</strong>, а не просто баг. Неймспейсуйте кожен ключ за орендарем, не давайте одному галасливому орендарю витісняти гарячі дані всіх і інвалідуйте пооренно.</p>

<h2>Ізоляція — трактуйте як властивість безпеки</h2>
<ul>
<li><strong>Неймспейсуйте кожен ключ за орендарем:</strong> <code>tenant:{id}:entity:{key}</code>. Жоден шлях коду не має будувати ключ без сегмента орендаря. Розгляньте типізований будівник ключів, щоб його не можна було забути.</li>
<li>Для сильної ізоляції великих/регульованих орендарів використовуйте <strong>окрему логічну БД чи інстанс</strong>.</li>
</ul>

<h2>Справедливість — проблема галасливого сусіда</h2>
<p>Один орендар, що довбить кеш, не має витісняти гарячі дані решти. Варіанти: пооренні квоти/ліміти, витіснення LFU або виділені інстанси для дуже великих орендарів.</p>

<h2>Скоупована інвалідація</h2>
<p>Піднімайте пооренну версію/неймспейс, щоб інвалідувати лише записи цього орендаря (напр., <code>tenant:{id}:v{n}:*</code>).</p>

<h2>Моніторинг — за чим стежити</h2>
<ul>
<li><strong>Hit ratio</strong> (загальний і, бажано, пооренний) — раптове падіння сигналізує про stampede чи погану інвалідацію.</li>
<li><strong>Пам'ять + витіснення</strong> (<code>evicted_keys</code>), <strong>OOM</strong>-відхилення.</li>
<li><strong>Затримка / slowlog</strong> (O(N)-команди, великі ключі), <strong>під'єднані клієнти</strong>, <strong>розмір keyspace</strong>.</li>
<li><strong>Таймаути / помилки з'єднання</strong> на боці клієнта.</li>
</ul>

<div class="say"><strong>Скажіть так:</strong> «Ізоляцію орендарів у кеші я трактую як властивість безпеки, а не зручність — кожен ключ неймспейсований за орендарем через будівник ключів, який не обійти, великі орендарі отримують свій інстанс, а я стежу за пооренним hit ratio, витісненнями та slowlog, щоб галасливий сусід чи stampede швидко спливали».</div>
`,

"redis-caching-problems__redis-as-a-queue-vs-a-dedicated-broker": `
<p class="lead">Redis Lists (проста черга) та Streams (consumer groups, ack, відтворення) можуть працювати як легка черга. Проти виділеного брокера (Azure Service Bus, RabbitMQ, Kafka) Redis бракує сильної надійності, багатого маршрутизування, вбудованого dead-lettering та великомасштабної персистентності за замовчуванням.</p>

<h2>Коли Redis достатньо</h2>
<ul>
<li>Ви вже запускаєте Redis і хочете щось просте та швидке.</li>
<li>Втрата поодинокого повідомлення прийнятна (або ви використовуєте Streams для at-least-once).</li>
<li>Малі-середні беклоги, розподіл роботи «майже внутрішньопроцесно».</li>
</ul>
<p>Черга на List: <code>LPUSH</code> + <code>BRPOP</code> (блокуючий pop). Черга на Streams: <code>XADD</code> + consumer groups + <code>XACK</code> + pending list для відновлення.</p>

<h2>Коли потрібен виділений брокер</h2>
<ul>
<li>Критичні гарантії доставки, транзакції, порядок/сесії.</li>
<li>Вбудовані dead-letter queues, політики повторів, заплановані/відкладені повідомлення.</li>
<li>Великі беклоги, довге зберігання, fan-out у масштабі, багате маршрутизування (topics/subscriptions).</li>
</ul>

<table>
<tr><th></th><th>Redis List/Stream</th><th>Service Bus / Rabbit / Kafka</th></tr>
<tr><td>Надійність</td><td>обмежена за замовчуванням</td><td>сильна</td></tr>
<tr><td>DLQ / retry</td><td>зроби сам</td><td>вбудовано</td></tr>
<tr><td>Маршрутизування</td><td>мінімальне</td><td>багате (topics, bindings)</td></tr>
<tr><td>Вартість експлуатації</td><td>вже є</td><td>ще одна система</td></tr>
</table>

<div class="say"><strong>Скажіть так:</strong> «Redis Streams — непогана легка черга, коли я вже запускаю Redis і можу стерпіти його слабші гарантії. Для надійного, критичного обміну повідомленнями з DLQ, порядком і повторами я взяв би Azure Service Bus, а Redis лишив для кешу, локів та ефемерних черг. Правильний інструмент під задачу».</div>
`,

"redis-caching-problems__cache-penetration-negative-caching": `
<p class="lead">Penetration — це коли запити просять ключі, що <em>не існують</em> ні в кеші, <em>ні</em> в базі — кожен промахується повз кеш і б'є по БД. Типово при невалідних ID, скрапінгу чи зловмисному зондуванні. Кеш не дає захисту, бо нема чого кешувати… хіба що ви закешуєте «не знайдено».</p>

<h2>Виправлення</h2>
<ul>
<li><strong>Негативне кешування:</strong> кешуйте маркер-sentinel «промах» для відсутніх ключів із <em>коротким</em> TTL, щоб повторні звернення за тим самим відсутнім id обслуговувались із кешу, а не з БД. Тримайте TTL коротким, щоб пізніше створений запис не маскувався надовго.</li>
<li><strong>Bloom filter (або cuckoo filter):</strong> тримайте компактну ймовірнісну множину всіх ключів, що <em>могли б</em> існувати; якщо фільтр каже «точно відсутній», замикайте накоротко до звернення до кешу чи БД. Без хибних негативів, мала частка хибних позитивів.</li>
<li><strong>Валідація вводу / авторизація / rate limiting:</strong> відхиляйте очевидно невалідні id (формат, діапазон) і тротліть абузивних клієнтів на межі.</li>
</ul>
<pre><code>var v = await _cache.StringGetAsync(key);
if (v == NULL_SENTINEL) return null;          // negative cache hit
if (v.HasValue) return Deserialize(v);
var data = await _db.LoadAsync(id);
await _cache.StringSetAsync(key,
    data is null ? NULL_SENTINEL : Serialize(data),
    data is null ? shortTtl : ttl);           // cache the miss, briefly
return data;</code></pre>

<div class="warn"><strong>Обережно:</strong> необмежене негативне кешування id, обраних атакувальником, саме може заповнити пам'ять — обмежуйте його, використовуйте короткий TTL і віддавайте перевагу Bloom filter, коли множина валідних ключів велика й відома.</div>

<div class="say"><strong>Скажіть так:</strong> «Penetration — це промахи за ключами, яких нема ніде, тож кеш не допоможе, доки я не закешую відсутність. Я негативно кешую "не знайдено" з коротким TTL і прикриваю Bloom filter'ом для відомої множини ключів, плюс валідація вводу та rate limiting, щоб убити абузивне зондування».</div>
`,

"redis-caching-problems__cache-avalanche-ttl-jitter": `
<p class="lead">Avalanche — це коли велика кількість ключів протермінується (майже) тієї самої миті — або кеш рестартує порожнім — тож потік промахів б'є по базі одночасно й може її покласти.</p>

<h2>Чому трапляється</h2>
<ul>
<li>Багато ключів заповнили разом (напр., прогрів чи пакетне завдання) з <em>однаковим</em> TTL, тож усі протермінуються на одному тику.</li>
<li>Вузол кешу рестартував / зробив failover і повернувся холодним.</li>
</ul>

<h2>Виправлення</h2>
<ul>
<li><strong>TTL jitter:</strong> додайте випадковість до кожного TTL (<code>ttl + rand(0, spread)</code>), щоб протермінування розтягнулись, а не синхронізувались.</li>
<li><strong>Поступовий прогрів:</strong> підвантажуйте гарячі ключі поетапно, а не все одразу, і з TTL із jitter.</li>
<li><strong>Об'єднання запитів + поключовий лок перебудови:</strong> навіть якщо багато ключів протермінується, до БД доходить лише одна перебудова на ключ (див. stampede).</li>
<li><strong>Захистіть БД:</strong> circuit breaker / bulkhead, щоб сплеск не вичерпав з'єднання, плюс обслуговуйте stale-while-revalidate.</li>
</ul>
<pre><code>TimeSpan Jitter(TimeSpan baseTtl) =&gt;
    baseTtl + TimeSpan.FromSeconds(Random.Shared.Next(0, 60));</code></pre>

<div class="say"><strong>Скажіть так:</strong> «Avalanche — це масове одночасне протермінування — часто ключі з однаковим TTL вмирають разом або холодний рестарт. Головне виправлення — TTL jitter, щоб протермінування розтяглись, плюс поетапний прогрів, поключові локи перебудови та circuit breaker, щоб БД не затопило».</div>

<p><em>Пов'язане:</em> avalanche (багато ключів) проти breakdown (один гарячий ключ) проти stampede (паралельна перебудова одного ключа) — одна родина, різний масштаб.</p>
`,

"redis-caching-problems__cache-breakdown-a-single-hot-key-expires": `
<p class="lead">Breakdown (він же «hotspot invalid») — це одноключовий випадок stampede: один <em>дуже гарячий</em> ключ протермінувався, і в проміжку до перебудови величезна кількість паралельних запитів усі промахуються й б'ють по базі за цим одним значенням.</p>

<h2>Виправлення</h2>
<ul>
<li><strong>Single-flight лок перебудови:</strong> лише один запит перебудовує ключ (Redis <code>SET NX</code> між репліками, <code>SemaphoreSlim</code> у межах процесу); решта чекає коротко або віддає попереднє значення.</li>
<li><strong>Stale-while-revalidate:</strong> продовжуйте віддавати старе значення після логічного протермінування й оновлюйте у фоні, щоб жоден запит не стикнувся з порожнім гарячим ключем.</li>
<li><strong>Ніколи не протерміновуйте гарячі ключі; оновлюйте їх проактивно:</strong> для відомого гарячого ключа (конфіг головної, трендовий елемент) використовуйте фоновий оновлювач за таймером замість протермінування за TTL, щоб проміжку протермінування взагалі не було.</li>
<li><strong>Логічне протермінування:</strong> зберігайте значення + поле «expiresAt»; значення ніколи не видаляється за TTL, а хто помітить, що воно логічно застаріле, запускає фонове оновлення, поки всі далі читають поточне значення.</li>
</ul>

<div class="warn"><strong>Breakdown проти avalanche:</strong> breakdown = <em>один</em> гарячий ключ протермінувався під важкою конкуренцією; avalanche = <em>багато</em> ключів протермінувались разом. Виправлення для гарячого ключа — single-flight / не протермінувати; для avalanche — TTL jitter.</div>

<div class="say"><strong>Скажіть так:</strong> «Breakdown — це один гарячий ключ протермінувався й спричинив stampede за цим єдиним значенням. Я або перебудовую його single-flight, або віддаю stale-while-revalidate, або взагалі не протермінову гарячі ключі за TTL і оновлюю їх фоновим таймером — щоб ніколи не було проміжку порожнього ключа, на який можна навалитись».</div>
`,

"redis-caching-problems__hot-keys-traffic-skew-to-one-key": `
<p class="lead">Гарячий ключ — це один ключ, що отримує непропорційно велику частку трафіку (профіль знаменитості, трендовий товар, глобальний конфіг). Хоч Redis і швидкий, усе це навантаження лягає на єдиний шард/вузол, що володіє ключем, створюючи вузьке місце, яке Cluster не може розкидати.</p>

<h2>Чому це проблема</h2>
<ul>
<li>У Cluster ключ живе на одному слоті → одному primary. Шардинг не допомагає, бо гарячість — на єдиному ключі, а не розподілена по keyspace.</li>
<li>Той один вузол насичує CPU/мережу, поки інші простоюють; затримка для цього ключа (і його сусідів) зростає.</li>
<li>Якщо гарячий ключ ще й протермінується, зверху отримаєте breakdown.</li>
</ul>

<h2>Виправлення</h2>
<ul>
<li><strong>Локальний L1-кеш:</strong> кешуйте гаряче значення внутрішньопроцесно (короткий TTL), щоб більшість читань взагалі не досягала Redis. Крихітний near-cache поглинає перекіс.</li>
<li><strong>Репліки читання:</strong> розкидайте читання гарячого ключа по репліках, щоб помножити ємність читання.</li>
<li><strong>Розділення ключа / шардинг значення:</strong> реплікуйте значення під N ключами із суфіксами (<code>config:hot:0..N</code>) на різних слотах і нехай клієнти читають випадковий — розкидає навантаження по вузлах. Записи оновлюють усі копії.</li>
<li><strong>Об'єднання запитів на клієнті</strong>, щоб сплески згортались у менше звернень до бекенда.</li>
</ul>

<div class="say"><strong>Скажіть так:</strong> «Гарячий ключ прибиває навантаження до одного вузла, тож шардинг Cluster не допомагає. Я ставлю перед ним внутрішньопроцесний L1 із коротким TTL, щоб більшість читань не торкалась Redis, використовую репліки читання, щоб помножити ємність, а для крайніх випадків розділяю значення на N ключів на різних слотах і читаю випадкову копію».</div>
`,

"redis-caching-problems__big-keys-huge-values-block-the-server": `
<p class="lead">Великий ключ — це одне дуже велике значення (рядок у кілька мегабайтів або колекція з мільйонами елементів). Оскільки Redis однопотоковий, будь-яка O(N)-операція над ним — чи його видалення — може заблокувати весь сервер і стрибнути затримку для кожного іншого клієнта.</p>

<h2>Чому великі ключі шкодять</h2>
<ul>
<li><strong>Блокуючі операції:</strong> <code>DEL</code> величезного ключа, <code>HGETALL</code>/<code>SMEMBERS</code>/<code>LRANGE 0 -1</code> на величезній колекції чи серіалізація великого значення — усі O(N) на єдиному потоці, гальмують усіх.</li>
<li><strong>Сплески мережі й пам'яті:</strong> передавання мегабайтів на запит; у Cluster великий ключ не можна розбити по слотах, тож він розбалансовує вузол.</li>
<li><strong>Протермінування/витіснення великого ключа</strong> може спричинити стрибок затримки.</li>
</ul>

<h2>Виправлення</h2>
<ul>
<li><strong>Розділяйте великі значення:</strong> розбийте гігантський hash/list на багато менших ключів або зберігайте великі блоби в об'єктному сховищі (S3/Blob), а в Redis кешуйте лише посилання/метадані.</li>
<li><strong>Уникайте O(N)-команд:</strong> читайте поля/діапазони поступово (<code>HSCAN</code>, <code>SSCAN</code>, <code>LRANGE</code> з пагінацією), а не все одразу.</li>
<li><strong>Використовуйте <code>UNLINK</code> замість <code>DEL</code>:</strong> UNLINK звільняє пам'ять асинхронно у фоновому потоці, уникаючи блокуючого звільнення.</li>
<li><strong>Виявляйте їх:</strong> <code>redis-cli --bigkeys</code>, <code>MEMORY USAGE key</code> та slowlog.</li>
</ul>

<div class="say"><strong>Скажіть так:</strong> «Великі ключі небезпечні на однопотоковому сервері — одна O(N)-операція чи DEL на значенні в кілька МБ гальмує кожного клієнта. Я розділяю великі структури на менші ключі, тримаю великі блоби в об'єктному сховищі з лише посиланням у Redis, пагіную через HSCAN/SSCAN, видаляю через UNLINK і полюю на них через --bigkeys».</div>
`,

"redis-caching-problems__cache-pollution-eviction-oom": `
<p class="lead">Забруднення кешу — це коли малоцінні, рідко перевживані записи витискають справді гарячі дані, тож hit ratio падає, хоч кеш і «повний». Пов'язаний збій: досягнення <code>maxmemory</code> та або витіснення добрих даних, або відхилення записів (OOM).</p>

<h2>Як трапляється забруднення</h2>
<ul>
<li>Пакетне завдання, скан чи разовий звіт завантажують величезні обсяги даних, що більше ніколи не читають, витісняючи гарячий робочий набір (класика для простого LRU).</li>
<li>Невибіркове кешування всього (напр., write-through на даних із перевагою запису, що рідко перечитують).</li>
</ul>

<h2>Виправлення</h2>
<ul>
<li><strong>Використовуйте LFU, а не LRU:</strong> <code>allkeys-lfu</code> тримає часто вживані ключі й витісняє «одноразові хіти», що приносить скан. LFU стійкий до забруднення; LRU — ні.</li>
<li><strong>Контроль допуску:</strong> кешуйте лише на другому доступі (не допускайте разові читання) або використовуйте ймовірнісну політику допуску (у стилі TinyLFU), щоб скан не міг витіснити гарячі дані.</li>
<li><strong>Кешуйте вибірково:</strong> не кешуйте дані, які не перечитаєте; розділяйте «масові/сканувальні» шляхи доступу від кешованих.</li>
<li><strong>Короткі TTL + ліміти розміру на категорію;</strong> пооренні квоти, щоб один орендар не забруднював спільну пам'ять.</li>
</ul>

<h2>Витіснення / OOM</h2>
<p>Коли досягнуто <code>maxmemory</code>, політика витіснення вирішує: чистий кеш має використовувати <code>allkeys-lru/lfu</code>; сховище, що не має втрачати дані, — <code>noeviction</code> (записи тоді падають з OOM — обробляйте це як backpressure). Стежте за <code>evicted_keys</code> та фрагментацією пам'яті.</p>

<div class="say"><strong>Скажіть так:</strong> «Забруднення — це малоцінні записи, що витісняють гарячі, зазвичай скан чи пакетне завдання за простого LRU. Я переходжу на LFU (чи допуск у стилі TinyLFU, щоб скан не витіснив робочий набір), кешую вибірково, а не все, і ставлю пооренні квоти. На maxmemory кеш витісняє LRU/LFU, а сховище-джерело правди використовує noeviction і трактує OOM як backpressure».</div>
`,
};
