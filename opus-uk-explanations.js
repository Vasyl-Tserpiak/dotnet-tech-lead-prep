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
`

};
