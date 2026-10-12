/* The store images' own words in the extension's thirteen languages (11 Oct
 * 2026). store-frames.html and promo-tiles.html read `?lang=` and replace
 * every element marked `data-t` with its entry here; `?shots=` points the
 * frames at captures made in that language (site-shots.js --lang --out).
 * Markup inside an entry is the English markup's own: <b> only. A script
 * rather than JSON because the pages are opened from file://, where a fetch
 * of a sibling file is refused. Local tooling, never shipped. */
window.STORE_I18N = {
  en: {
    newtab: "New Tab",
    "hero.tag": "Live crypto charts on every new tab.",
    "hero.p1": "<b>Zero</b> permissions at install",
    "hero.p2": "No account",
    "hero.p3": "Your data <b>stays on your device</b>",
    "f02.k": "Widgets", "f02.t": "Arranged like a phone’s — <b>sized and pinned by you</b>",
    "f03.k": "News", "f03.t": "Read the story — <b>and a counted reading of it</b>",
    "f04.k": "Calls", "f04.t": "Say where the price goes — <b>and keep the score</b>",
    "f05.k": "Portfolio", "f05.t": "What you hold, <b>what it cost</b>, what it’s worth",
    "tile.tag": "Live crypto charts on every new tab",
    "marquee.tag": "Your new tab is now a <b>live crypto dashboard</b>.",
    "pill.coins": "<b>81</b> coins", "pill.widgets": "<b>26</b> widgets", "pill.zero": "<b>Zero</b> permissions", "pill.langs": "<b>13</b> languages", "pill.open": "<b>Open</b> source",
  },
  tr: {
    newtab: "Yeni Sekme",
    "hero.tag": "Her yeni sekmede canlı kripto grafikleri.",
    "hero.p1": "Kurulumda <b>sıfır</b> izin",
    "hero.p2": "Hesap yok",
    "hero.p3": "Verileriniz <b>cihazınızda kalır</b>",
    "f02.k": "Widget'lar", "f02.t": "Telefondaki gibi dizilir — <b>boyutunu ve yerini siz seçersiniz</b>",
    "f03.k": "Haberler", "f03.t": "Haberi okuyun — <b>yanında sayılmış bir okumasıyla</b>",
    "f04.k": "Tahminler", "f04.t": "Fiyatın nereye gideceğini söyleyin — <b>skorunuzu tutun</b>",
    "f05.k": "Portföy", "f05.t": "Elinizdeki, <b>neye mal olduğu</b>, bugün ne ettiği",
    "tile.tag": "Her yeni sekmede canlı kripto grafikleri",
    "marquee.tag": "Yeni sekmeniz artık <b>canlı bir kripto paneli</b>.",
    "pill.coins": "<b>81</b> coin", "pill.widgets": "<b>26</b> widget", "pill.zero": "<b>Sıfır</b> izin", "pill.langs": "<b>13</b> dil", "pill.open": "<b>Açık</b> kaynak",
  },
  de: {
    newtab: "Neuer Tab",
    "hero.tag": "Live-Kryptocharts in jedem neuen Tab.",
    "hero.p1": "<b>Keine</b> Berechtigungen bei der Installation",
    "hero.p2": "Kein Konto",
    "hero.p3": "Deine Daten <b>bleiben auf deinem Gerät</b>",
    "f02.k": "Widgets", "f02.t": "Angeordnet wie auf dem Handy — <b>Größe und Platz bestimmst du</b>",
    "f03.k": "Nachrichten", "f03.t": "Lies die Meldung — <b>mit einer gezählten Einordnung</b>",
    "f04.k": "Prognosen", "f04.t": "Sag, wohin der Kurs geht — <b>und führe Buch darüber</b>",
    "f05.k": "Portfolio", "f05.t": "Was du hältst, <b>was es gekostet hat</b>, was es wert ist",
    "tile.tag": "Live-Kryptocharts in jedem neuen Tab",
    "marquee.tag": "Dein neuer Tab ist jetzt ein <b>Live-Krypto-Dashboard</b>.",
    "pill.coins": "<b>81</b> Coins", "pill.widgets": "<b>26</b> Widgets", "pill.zero": "<b>Keine</b> Berechtigungen", "pill.langs": "<b>13</b> Sprachen", "pill.open": "<b>Open</b> Source",
  },
  es: {
    newtab: "Nueva pestaña",
    "hero.tag": "Gráficos de cripto en vivo en cada pestaña nueva.",
    "hero.p1": "<b>Cero</b> permisos al instalar",
    "hero.p2": "Sin cuenta",
    "hero.p3": "Tus datos <b>se quedan en tu dispositivo</b>",
    "f02.k": "Widgets", "f02.t": "Ordenados como en un móvil — <b>tú eliges tamaño y lugar</b>",
    "f03.k": "Noticias", "f03.t": "Lee la noticia — <b>y una lectura contada de ella</b>",
    "f04.k": "Predicciones", "f04.t": "Di adónde va el precio — <b>y lleva la cuenta</b>",
    "f05.k": "Cartera", "f05.t": "Lo que tienes, <b>lo que costó</b>, lo que vale",
    "tile.tag": "Gráficos de cripto en vivo en cada pestaña nueva",
    "marquee.tag": "Tu nueva pestaña es ahora un <b>panel de cripto en vivo</b>.",
    "pill.coins": "<b>81</b> monedas", "pill.widgets": "<b>26</b> widgets", "pill.zero": "<b>Cero</b> permisos", "pill.langs": "<b>13</b> idiomas", "pill.open": "Código <b>abierto</b>",
  },
  fr: {
    newtab: "Nouvel onglet",
    "hero.tag": "Des graphiques crypto en direct dans chaque nouvel onglet.",
    "hero.p1": "<b>Aucune</b> autorisation à l’installation",
    "hero.p2": "Sans compte",
    "hero.p3": "Vos données <b>restent sur votre appareil</b>",
    "f02.k": "Widgets", "f02.t": "Rangés comme sur un téléphone — <b>taille et place choisies par vous</b>",
    "f03.k": "Actualités", "f03.t": "Lisez l’article — <b>avec une lecture chiffrée</b>",
    "f04.k": "Pronostics", "f04.t": "Dites où va le prix — <b>et tenez le score</b>",
    "f05.k": "Portefeuille", "f05.t": "Ce que vous détenez, <b>ce que ça a coûté</b>, ce que ça vaut",
    "tile.tag": "Des graphiques crypto en direct dans chaque nouvel onglet",
    "marquee.tag": "Votre nouvel onglet devient un <b>tableau de bord crypto en direct</b>.",
    "pill.coins": "<b>81</b> cryptos", "pill.widgets": "<b>26</b> widgets", "pill.zero": "<b>Aucune</b> autorisation", "pill.langs": "<b>13</b> langues", "pill.open": "<b>Open</b> source",
  },
  id: {
    newtab: "Tab Baru",
    "hero.tag": "Grafik kripto langsung di setiap tab baru.",
    "hero.p1": "<b>Tanpa</b> izin saat dipasang",
    "hero.p2": "Tanpa akun",
    "hero.p3": "Data Anda <b>tetap di perangkat Anda</b>",
    "f02.k": "Widget", "f02.t": "Ditata seperti di ponsel — <b>ukuran dan letaknya pilihan Anda</b>",
    "f03.k": "Berita", "f03.t": "Baca beritanya — <b>beserta bacaan terhitungnya</b>",
    "f04.k": "Tebakan", "f04.t": "Tebak ke mana harga bergerak — <b>dan catat skornya</b>",
    "f05.k": "Portofolio", "f05.t": "Yang Anda pegang, <b>harga belinya</b>, nilainya kini",
    "tile.tag": "Grafik kripto langsung di setiap tab baru",
    "marquee.tag": "Tab baru Anda kini menjadi <b>dasbor kripto langsung</b>.",
    "pill.coins": "<b>81</b> koin", "pill.widgets": "<b>26</b> widget", "pill.zero": "<b>Tanpa</b> izin", "pill.langs": "<b>13</b> bahasa", "pill.open": "<b>Sumber</b> terbuka",
  },
  it: {
    newtab: "Nuova scheda",
    "hero.tag": "Grafici crypto in tempo reale in ogni nuova scheda.",
    "hero.p1": "<b>Nessun</b> permesso all’installazione",
    "hero.p2": "Nessun account",
    "hero.p3": "I tuoi dati <b>restano sul tuo dispositivo</b>",
    "f02.k": "Widget", "f02.t": "Disposti come su un telefono — <b>dimensione e posto li scegli tu</b>",
    "f03.k": "Notizie", "f03.t": "Leggi la notizia — <b>con una lettura contata</b>",
    "f04.k": "Previsioni", "f04.t": "Di’ dove va il prezzo — <b>e tieni il punteggio</b>",
    "f05.k": "Portafoglio", "f05.t": "Cosa possiedi, <b>quanto è costato</b>, quanto vale",
    "tile.tag": "Grafici crypto in tempo reale in ogni nuova scheda",
    "marquee.tag": "La tua nuova scheda è ora una <b>dashboard crypto dal vivo</b>.",
    "pill.coins": "<b>81</b> monete", "pill.widgets": "<b>26</b> widget", "pill.zero": "<b>Zero</b> permessi", "pill.langs": "<b>13</b> lingue", "pill.open": "<b>Open</b> source",
  },
  ja: {
    newtab: "新しいタブ",
    "hero.tag": "新しいタブを開くたびにライブの暗号資産チャート。",
    "hero.p1": "インストール時の権限は<b>ゼロ</b>",
    "hero.p2": "アカウント不要",
    "hero.p3": "データは<b>端末の中だけ</b>",
    "f02.k": "ウィジェット", "f02.t": "スマホのように並べる — <b>サイズも配置も自由</b>",
    "f03.k": "ニュース", "f03.t": "記事を読む — <b>数えた読み解き付き</b>",
    "f04.k": "予想", "f04.t": "価格の行き先を予想 — <b>成績は自分で記録</b>",
    "f05.k": "ポートフォリオ", "f05.t": "保有資産、<b>取得コスト</b>、現在の価値",
    "tile.tag": "新しいタブにライブの暗号資産チャート",
    "marquee.tag": "新しいタブが<b>ライブの暗号資産ダッシュボード</b>に。",
    "pill.coins": "<b>81</b> 銘柄", "pill.widgets": "<b>26</b> ウィジェット", "pill.zero": "権限 <b>ゼロ</b>", "pill.langs": "<b>13</b> 言語", "pill.open": "<b>オープン</b>ソース",
  },
  ko: {
    newtab: "새 탭",
    "hero.tag": "새 탭마다 실시간 암호화폐 차트.",
    "hero.p1": "설치 시 권한 <b>제로</b>",
    "hero.p2": "계정 불필요",
    "hero.p3": "데이터는 <b>기기에만 저장</b>",
    "f02.k": "위젯", "f02.t": "휴대폰처럼 배치 — <b>크기와 위치는 직접</b>",
    "f03.k": "뉴스", "f03.t": "기사를 읽고 — <b>숫자로 정리된 해설까지</b>",
    "f04.k": "예측", "f04.t": "가격의 방향을 예측하고 — <b>점수를 기록하세요</b>",
    "f05.k": "포트폴리오", "f05.t": "보유 자산, <b>매입 비용</b>, 현재 가치",
    "tile.tag": "새 탭마다 실시간 암호화폐 차트",
    "marquee.tag": "새 탭이 이제 <b>실시간 암호화폐 대시보드</b>입니다.",
    "pill.coins": "코인 <b>81</b>개", "pill.widgets": "위젯 <b>26</b>개", "pill.zero": "권한 <b>제로</b>", "pill.langs": "<b>13</b>개 언어", "pill.open": "<b>오픈</b> 소스",
  },
  pt_BR: {
    newtab: "Nova guia",
    "hero.tag": "Gráficos de cripto ao vivo em cada nova guia.",
    "hero.p1": "<b>Zero</b> permissões na instalação",
    "hero.p2": "Sem conta",
    "hero.p3": "Seus dados <b>ficam no seu dispositivo</b>",
    "f02.k": "Widgets", "f02.t": "Organizados como no celular — <b>tamanho e lugar escolhidos por você</b>",
    "f03.k": "Notícias", "f03.t": "Leia a matéria — <b>com uma leitura contada dela</b>",
    "f04.k": "Palpites", "f04.t": "Diga para onde o preço vai — <b>e acompanhe o placar</b>",
    "f05.k": "Portfólio", "f05.t": "O que você tem, <b>quanto custou</b>, quanto vale",
    "tile.tag": "Gráficos de cripto ao vivo em cada nova guia",
    "marquee.tag": "Sua nova guia agora é um <b>painel de cripto ao vivo</b>.",
    "pill.coins": "<b>81</b> moedas", "pill.widgets": "<b>26</b> widgets", "pill.zero": "<b>Zero</b> permissões", "pill.langs": "<b>13</b> idiomas", "pill.open": "Código <b>aberto</b>",
  },
  ru: {
    newtab: "Новая вкладка",
    "hero.tag": "Живые графики криптовалют в каждой новой вкладке.",
    "hero.p1": "<b>Ноль</b> разрешений при установке",
    "hero.p2": "Без аккаунта",
    "hero.p3": "Ваши данные <b>остаются на устройстве</b>",
    "f02.k": "Виджеты", "f02.t": "Как на телефоне — <b>размер и место выбираете вы</b>",
    "f03.k": "Новости", "f03.t": "Читайте новость — <b>с подсчитанным разбором</b>",
    "f04.k": "Прогнозы", "f04.t": "Скажите, куда пойдёт цена, — <b>и ведите счёт</b>",
    "f05.k": "Портфель", "f05.t": "Что у вас есть, <b>во сколько обошлось</b>, сколько стоит",
    "tile.tag": "Живые графики криптовалют в каждой новой вкладке",
    "marquee.tag": "Ваша новая вкладка — теперь <b>живая крипто-панель</b>.",
    "pill.coins": "<b>81</b> монета", "pill.widgets": "<b>26</b> виджетов", "pill.zero": "<b>Ноль</b> разрешений", "pill.langs": "<b>13</b> языков", "pill.open": "<b>Открытый</b> код",
  },
  uk: {
    newtab: "Нова вкладка",
    "hero.tag": "Живі графіки криптовалют у кожній новій вкладці.",
    "hero.p1": "<b>Нуль</b> дозволів під час встановлення",
    "hero.p2": "Без акаунта",
    "hero.p3": "Ваші дані <b>лишаються на пристрої</b>",
    "f02.k": "Віджети", "f02.t": "Як на телефоні — <b>розмір і місце обираєте ви</b>",
    "f03.k": "Новини", "f03.t": "Читайте новину — <b>з підрахованим розбором</b>",
    "f04.k": "Прогнози", "f04.t": "Скажіть, куди піде ціна, — <b>і ведіть рахунок</b>",
    "f05.k": "Портфель", "f05.t": "Що у вас є, <b>скільки коштувало</b>, скільки варте",
    "tile.tag": "Живі графіки криптовалют у кожній новій вкладці",
    "marquee.tag": "Ваша нова вкладка — тепер <b>жива крипто-панель</b>.",
    "pill.coins": "<b>81</b> монета", "pill.widgets": "<b>26</b> віджетів", "pill.zero": "<b>Нуль</b> дозволів", "pill.langs": "<b>13</b> мов", "pill.open": "<b>Відкритий</b> код",
  },
  zh_CN: {
    newtab: "新标签页",
    "hero.tag": "每个新标签页都是实时加密货币图表。",
    "hero.p1": "安装时<b>零</b>权限",
    "hero.p2": "无需账户",
    "hero.p3": "数据<b>只保存在你的设备上</b>",
    "f02.k": "小组件", "f02.t": "像手机一样排列 — <b>大小和位置由你决定</b>",
    "f03.k": "新闻", "f03.t": "阅读新闻 — <b>附带计数解读</b>",
    "f04.k": "预测", "f04.t": "说出价格走向 — <b>并记录你的成绩</b>",
    "f05.k": "投资组合", "f05.t": "你持有什么、<b>成本多少</b>、现值多少",
    "tile.tag": "每个新标签页都是实时加密货币图表",
    "marquee.tag": "你的新标签页现在是<b>实时加密货币看板</b>。",
    "pill.coins": "<b>81</b> 种币", "pill.widgets": "<b>26</b> 个小组件", "pill.zero": "<b>零</b>权限", "pill.langs": "<b>13</b> 种语言", "pill.open": "<b>开源</b>",
  },
};

/* Apply `?lang=` and `?shots=` to the page. */
(function applyStoreLang() {
  const q = new URLSearchParams(location.search);
  const lang = q.get("lang");
  const shots = q.get("shots");
  const dict = lang && window.STORE_I18N[lang];
  const run = () => {
    if (dict) {
      document.documentElement.lang = lang.replace("_", "-");
      for (const el of document.querySelectorAll("[data-t]")) {
        const v = dict[el.getAttribute("data-t")];
        if (typeof v === "string") el.innerHTML = v;
      }
      for (const el of document.querySelectorAll(".browser .tab")) {
        const img = el.querySelector("img");
        if (!img || el.classList.contains("hit")) continue;
        el.textContent = "";
        el.appendChild(img);
        el.appendChild(document.createTextNode(dict.newtab));
      }
    }
    if (shots) {
      for (const img of document.querySelectorAll("img.shot")) {
        const name = img.getAttribute("src").split("/").pop();
        img.setAttribute("src", `${shots.replace(/\/$/, "")}/${name}`);
      }
    }
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", run);
  else run();
})();
