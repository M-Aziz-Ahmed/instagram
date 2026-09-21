// ─────────────────────────────────────────────────────────────
// Deep English syllabus blueprint. Each lesson's target-language
// translations live in live-server/learnDeep/<lang>.js (authored
// per language). `unit` groups lessons into stages; review
// lessons are appended automatically by buildCourses.
// ─────────────────────────────────────────────────────────────

const LESSONS = {
    // ── UNIT 1 (Rookie) ──
    d11: {
        id: "d11", title: "Numbers 11–20", unit: 1,
        vocab: [["eleven", "", "🔢"], ["twelve", "", "🔢"], ["thirteen", "", "🔢"], ["fourteen", "", "🔢"], ["fifteen", "", "🔢"], ["sixteen", "", "🔢"], ["seventeen", "", "🔢"], ["eighteen", "", "🔢"], ["nineteen", "", "🔢"], ["twenty", "", "🔢"]],
        phrases: [["I have fifteen apples", "🍎"], ["There are twenty people", "👥"]],
    },
    // ── UNIT 2 (Rookie) ──
    d21: {
        id: "d21", title: "Numbers to 100", unit: 2,
        vocab: [["thirty", "", "🔢"], ["forty", "", "🔢"], ["fifty", "", "🔢"], ["sixty", "", "🔢"], ["seventy", "", "🔢"], ["eighty", "", "🔢"], ["ninety", "", "🔢"], ["hundred", "", "🔢"], ["number", "", "🔢"], ["zero", "", "🔢"]],
        phrases: [["There are fifty students", "🎓"], ["One hundred days", "📅"]],
    },
    d22: {
        id: "d22", title: "Time of Day", unit: 2,
        vocab: [["morning", "", "🌅"], ["afternoon", "", "☀️"], ["evening", "", "🌇"], ["night", "", "🌙"], ["hour", "", "⏰"], ["minute", "", "⏱️"], ["now", "", "🕐"], ["later", "", "🕒"]],
        phrases: [["I wake up in the morning", "🌅"], ["See you later tonight", "🌙"]],
    },
    d23: {
        id: "d23", title: "Days of the Week", unit: 2,
        vocab: [["monday", "", "📅"], ["tuesday", "", "📅"], ["wednesday", "", "📅"], ["thursday", "", "📅"], ["friday", "", "📅"], ["saturday", "", "📅"], ["sunday", "", "📅"], ["today", "", "📆"], ["tomorrow", "", "🌅"], ["yesterday", "", "🌙"]],
        phrases: [["Today is Monday", "📅"], ["I work on Friday", "💼"]],
    },
    d24: {
        id: "d24", title: "Months of the Year", unit: 2,
        vocab: [["january", "", "📅"], ["february", "", "📅"], ["march", "", "📅"], ["april", "", "📅"], ["may", "", "📅"], ["june", "", "📅"], ["july", "", "📅"], ["august", "", "📅"], ["september", "", "📅"], ["october", "", "📅"]],
        phrases: [["My birthday is in May", "🎂"], ["January is cold", "❄️"]],
    },
    // ── UNIT 3 (Rookie) ──
    d31: {
        id: "d31", title: "Drinks", unit: 3,
        vocab: [["water", "", "💧"], ["coffee", "", "☕"], ["tea", "", "🫖"], ["milk", "", "🥛"], ["juice", "", "🧃"], ["wine", "", "🍷"], ["beer", "", "🍺"], ["soda", "", "🥤"]],
        phrases: [["I drink water every day", "💧"], ["Do you want some tea?", "🫖"]],
    },
    d32: {
        id: "d32", title: "Meals", unit: 3,
        vocab: [["breakfast", "", "🍳"], ["lunch", "", "🥪"], ["dinner", "", "🍲"], ["hungry", "", "😋"], ["thirsty", "", "🥤"], ["taste", "", "👅"], ["delicious", "", "😍"], ["full", "", "🤰"]],
        phrases: [["Breakfast is ready", "🍳"], ["I am very hungry", "😋"]],
    },
    d33: {
        id: "d33", title: "Fruit", unit: 3,
        vocab: [["apple", "", "🍎"], ["banana", "", "🍌"], ["orange", "", "🍊"], ["grape", "", "🍇"], ["strawberry", "", "🍓"], ["watermelon", "", "🍉"], ["peach", "", "🍑"], ["lemon", "", "🍋"]],
        phrases: [["The watermelon is sweet", "🍉"], ["I love strawberries", "🍓"]],
    },
    // ── UNIT 4 (Explorer) ──
    d41: {
        id: "d41", title: "Vegetables", unit: 4,
        vocab: [["tomato", "", "🍅"], ["potato", "", "🥔"], ["carrot", "", "🥕"], ["onion", "", "🧅"], ["corn", "", "🌽"], ["salt", "", "🧂"], ["sugar", "", "🍬"], ["oil", "", "🫗"]],
        phrases: [["The salad has tomatoes", "🥗"], ["I don't like onions", "🧅"]],
    },
    d42: {
        id: "d42", title: "At the Restaurant", unit: 4,
        vocab: [["menu", "", "📋"], ["waiter", "", "💁"], ["order", "", "🧾"], ["table", "", "🪑"], ["bill", "", "🧾"], ["spoon", "", "🥄"], ["fork", "", "🍴"], ["knife", "", "🔪"]],
        phrases: [["Can I see the menu?", "📋"], ["The bill, please", "🧾"]],
    },
    d43: {
        id: "d43", title: "Adjectives 1", unit: 4,
        vocab: [["good", "", "👍"], ["bad", "", "👎"], ["big", "", "🦣"], ["small", "", "🐭"], ["hot", "", "🌡️"], ["cold", "", "❄️"], ["new", "", "✨"], ["old", "", "🏛️"]],
        phrases: [["The soup is hot", "🌡️"], ["This is a small car", "🚗"]],
    },
    // ── UNIT 5 (Explorer) ──
    d51: {
        id: "d51", title: "Family", unit: 5,
        vocab: [["grandfather", "", "🧓"], ["grandmother", "", "👵"], ["uncle", "", "👨"], ["aunt", "", "👩"], ["cousin", "", "🧑"], ["husband", "", "🤵"], ["wife", "", "👰"], ["baby", "", "👶"]],
        phrases: [["My grandmother is kind", "👵"], ["My uncle has a farm", "🚜"]],
    },
    d52: {
        id: "d52", title: "The Body", unit: 5,
        vocab: [["head", "", "🙂"], ["eye", "", "👁️"], ["ear", "", "👂"], ["nose", "", "👃"], ["mouth", "", "👄"], ["hand", "", "✋"], ["leg", "", "🦵"], ["foot", "", "🦶"]],
        phrases: [["Close your eyes", "👁️"], ["I wash my hands", "✋"]],
    },
    d53: {
        id: "d53", title: "Feelings", unit: 5,
        vocab: [["happy", "", "😄"], ["sad", "", "😢"], ["angry", "", "😠"], ["tired", "", "😴"], ["scared", "", "😨"], ["excited", "", "🤩"], ["calm", "", "😌"], ["proud", "", "😊"]],
        phrases: [["I feel very tired", "😴"], ["She looks happy today", "😄"]],
    },
    // ── UNIT 6 (Explorer) ──
    d61: {
        id: "d61", title: "Weather", unit: 6,
        vocab: [["sun", "", "☀️"], ["rain", "", "🌧️"], ["snow", "", "🌨️"], ["wind", "", "💨"], ["cloudy", "", "☁️"], ["storm", "", "⛈️"], ["warm", "", "🌤️"], ["cool", "", "🌈"]],
        phrases: [["It is raining today", "🌧️"], ["The sun is shining", "☀️"]],
    },
    d62: {
        id: "d62", title: "Seasons", unit: 6,
        vocab: [["spring", "", "🌸"], ["summer", "", "🏖️"], ["autumn", "", "🍂"], ["winter", "", "⛄"], ["season", "", "🍃"], ["weather", "", "🌤️"], ["month", "", "📅"], ["year", "", "🎊"]],
        phrases: [["Winter is very cold", "⛄"], ["Summer is my favorite season", "🏖️"]],
    },
    d63: {
        id: "d63", title: "Clothes", unit: 6,
        vocab: [["shirt", "", "👕"], ["pants", "", "👖"], ["shoes", "", "👟"], ["dress", "", "👗"], ["hat", "", "🎩"], ["coat", "", "🧥"], ["socks", "", "🧦"], ["jacket", "", "🧥"]],
        phrases: [["I buy a new shirt", "👕"], ["My shoes are black", "👟"]],
    },
    // ── UNIT 7 (Adventurer) ──
    d71: {
        id: "d71", title: "Home", unit: 7,
        vocab: [["house", "", "🏠"], ["kitchen", "", "🍳"], ["bedroom", "", "🛏️"], ["bathroom", "", "🛁"], ["garden", "", "🌻"], ["door", "", "🚪"], ["window", "", "🪟"], ["street", "", "🛣️"]],
        phrases: [["The house has a big garden", "🌻"], ["Close the door, please", "🚪"]],
    },
    d72: {
        id: "d72", title: "Furniture", unit: 7,
        vocab: [["table", "", "🪑"], ["chair", "", "🪑"], ["bed", "", "🛏️"], ["sofa", "", "🛋️"], ["lamp", "", "💡"], ["mirror", "", "🪞"], ["clock", "", "🕰️"], ["carpet", "", "🧶"]],
        phrases: [["The clock is on the wall", "🕰️"], ["I sit on the sofa", "🛋️"]],
    },
    d73: {
        id: "d73", title: "In the City", unit: 7,
        vocab: [["city", "", "🌆"], ["park", "", "🌳"], ["market", "", "🏪"], ["bridge", "", "🌉"], ["building", "", "🏢"], ["square", "", "⛲"], ["library", "", "📚"], ["station", "", "🚉"]],
        phrases: [["The library is in the city", "📚"], ["We meet in the park", "🌳"]],
    },
    // ── UNIT 8 (Adventurer) ──
    d81: {
        id: "d81", title: "Transport", unit: 8,
        vocab: [["bus", "", "🚌"], ["car", "", "🚗"], ["train", "", "🚆"], ["plane", "", "✈️"], ["boat", "", "⛵"], ["bike", "", "🚲"], ["subway", "", "🚇"], ["flight", "", "🛫"]],
        phrases: [["I go to work by bus", "🚌"], ["The plane is late", "✈️"]],
    },
    d82: {
        id: "d82", title: "Directions", unit: 8,
        vocab: [["left", "", "⬅️"], ["right", "", "➡️"], ["straight", "", "⬆️"], ["near", "", "🤏"], ["far", "", "🔭"], ["north", "", "🧭"], ["here", "", "📍"], ["there", "", "👈"]],
        phrases: [["Turn left at the park", "⬅️"], ["The station is near here", "🚉"]],
    },
    d83: {
        id: "d83", title: "Hotel & Trip", unit: 8,
        vocab: [["hotel", "", "🏨"], ["room", "", "🚪"], ["key", "", "🔑"], ["reservation", "", "📝"], ["guest", "", "🧳"], ["check-in", "", "🛎️"], ["luggage", "", "🧳"], ["trip", "", "🧭"]],
        phrases: [["I have a reservation", "📝"], ["Welcome to the hotel", "🏨"]],
    },
    // ── UNIT 9 (Pathfinder) ──
    d91: {
        id: "d91", title: "Work & Jobs", unit: 9,
        vocab: [["work", "", "💼"], ["office", "", "🏢"], ["job", "", "📄"], ["boss", "", "👔"], ["colleague", "", "🤝"], ["meeting", "", "📞"], ["salary", "", "💰"], ["manager", "", "🧑‍💼"]],
        phrases: [["The meeting is at nine", "📞"], ["She is my colleague", "🤝"]],
    },
    d92: {
        id: "d92", title: "School", unit: 9,
        vocab: [["school", "", "🏫"], ["study", "", "📖"], ["homework", "", "📝"], ["exam", "", "📋"], ["class", "", "👩‍🏫"], ["library", "", "📚"], ["lesson", "", "📖"], ["question", "", "❓"]],
        phrases: [["I study every evening", "📖"], ["The exam is next week", "📋"]],
    },
    d93: {
        id: "d93", title: "Health", unit: 9,
        vocab: [["health", "", "💪"], ["sick", "", "🤒"], ["pain", "", "🤕"], ["medicine", "", "💊"], ["hospital", "", "🏥"], ["healthy", "", "🥗"], ["rest", "", "😴"], ["doctor", "", "🩺"]],
        phrases: [["I feel sick today", "🤒"], ["Get some rest", "😴"]],
    },
    // ── UNIT 10 (Pathfinder) ──
    d101: {
        id: "d101", title: "Sports", unit: 10,
        vocab: [["soccer", "", "⚽"], ["basketball", "", "🏀"], ["tennis", "", "🎾"], ["swim", "", "🏊"], ["run", "", "🏃"], ["team", "", "👥"], ["game", "", "🎮"], ["win", "", "🏆"]],
        phrases: [["We play soccer on Sunday", "⚽"], ["Our team won the game", "🏆"]],
    },
    d102: {
        id: "d102", title: "Hobbies", unit: 10,
        vocab: [["read", "", "📖"], ["music", "", "🎵"], ["sing", "", "🎤"], ["dance", "", "💃"], ["draw", "", "🎨"], ["cook", "", "🍳"], ["travel", "", "🧭"], ["photo", "", "📸"]],
        phrases: [["I love to read books", "📖"], ["She sings very well", "🎤"]],
    },
    d103: {
        id: "d103", title: "Nature", unit: 10,
        vocab: [["tree", "", "🌳"], ["mountain", "", "⛰️"], ["river", "", "🏞️"], ["sea", "", "🌊"], ["forest", "", "🌲"], ["flower", "", "🌸"], ["sky", "", "☁️"], ["land", "", "🟩"]],
        phrases: [["The river is very long", "🏞️"], ["Look at the mountains", "⛰️"]],
    },
    // ── UNIT 11 (Pathfinder) ──
    d111: {
        id: "d111", title: "Animals", unit: 11,
        vocab: [["horse", "", "🐎"], ["cow", "", "🐮"], ["bird", "", "🐦"], ["fish", "", "🐟"], ["rabbit", "", "🐰"], ["tiger", "", "🐯"], ["elephant", "", "🐘"], ["monkey", "", "🐵"]],
        phrases: [["The bird sings in the morning", "🐦"], ["The elephant is big", "🐘"]],
    },
    d112: {
        id: "d112", title: "Countries", unit: 11,
        vocab: [["china", "", "🇨🇳"], ["india", "", "🇮🇳"], ["japan", "", "🇯🇵"], ["france", "", "🇫🇷"], ["brazil", "", "🇧🇷"], ["germany", "", "🇩🇪"], ["america", "", "🇺🇸"], ["pakistan", "", "🇵🇰"]],
        phrases: [["I want to visit Japan", "🇯🇵"], ["She is from Brazil", "🇧🇷"]],
    },
    d113: {
        id: "d113", title: "Languages", unit: 11,
        vocab: [["english", "", "🇬🇧"], ["chinese", "", "🇨🇳"], ["spanish", "", "🇪🇸"], ["arabic", "", "🌙"], ["hindi", "", "🇮🇳"], ["french", "", "🇫🇷"], ["japanese", "", "🇯🇵"], ["korean", "", "🇰🇷"]],
        phrases: [["Do you speak English?", "🗣️"], ["I am learning Chinese", "📚"]],
    },
    // ── UNIT 12 (Voyager) ──
    d121: {
        id: "d121", title: "Common Verbs 1", unit: 12,
        vocab: [["go", "", "➡️"], ["come", "", "👋"], ["see", "", "👀"], ["want", "", "🙏"], ["need", "", "❗"], ["like", "", "👍"], ["can", "", "✅"], ["have", "", "🤲"]],
        phrases: [["I want to go home", "🏠"], ["Can you come here?", "👋"]],
    },
    d122: {
        id: "d122", title: "Common Verbs 2", unit: 12,
        vocab: [["know", "", "🧠"], ["think", "", "🤔"], ["say", "", "🗣️"], ["give", "", "🎁"], ["take", "", "🙌"], ["make", "", "🛠️"], ["find", "", "🔍"], ["help", "", "🤝"]],
        phrases: [["I know the answer", "🧠"], ["Can you help me?", "🤝"]],
    },
    d123: {
        id: "d123", title: "Question Words", unit: 12,
        vocab: [["who", "", "🙋"], ["what", "", "❓"], ["where", "", "📍"], ["when", "", "⏰"], ["why", "", "🤷"], ["how", "", "💡"], ["which", "", "🔀"], ["how much", "", "💰"]],
        phrases: [["Where is the station?", "🚉"], ["How much does it cost?", "💰"]],
    },
    // ── UNIT 13 (Voyager) ──
    d131: {
        id: "d131", title: "My & Your", unit: 13,
        vocab: [["my", "", "👤"], ["your", "", "🙂"], ["his", "", "👨"], ["her", "", "👩"], ["our", "", "👥"], ["their", "", "👫"], ["mine", "", "🤲"], ["yours", "", "🎁"]],
        phrases: [["This is my book", "📚"], ["Is this your phone?", "📱"]],
    },
    d132: {
        id: "d132", title: "Prepositions", unit: 13,
        vocab: [["in", "", "📦"], ["on", "", "⬆️"], ["under", "", "⬇️"], ["next to", "", "↔️"], ["behind", "", "🔙"], ["in front of", "", "➡️"], ["between", "", "🟰"], ["with", "", "🤝"]],
        phrases: [["The cat is on the table", "🐱"], ["The park is next to my house", "🏡"]],
    },
    d133: {
        id: "d133", title: "Time Words", unit: 13,
        vocab: [["today", "", "📆"], ["tomorrow", "", "🌅"], ["yesterday", "", "🌙"], ["now", "", "⏰"], ["soon", "", "⏳"], ["always", "", "♾️"], ["never", "", "🚫"], ["often", "", "🔁"]],
        phrases: [["I am busy now", "⏰"], ["We will meet soon", "⏳"]],
    },
    // ── UNIT 14 (Voyager) ──
    d141: {
        id: "d141", title: "Opposites", unit: 14,
        vocab: [["fast", "", "🐆"], ["slow", "", "🐢"], ["strong", "", "💪"], ["weak", "", "🌱"], ["easy", "", "😌"], ["difficult", "", "🧗"], ["quiet", "", "🤫"], ["loud", "", "📢"]],
        phrases: [["This exercise is easy", "😌"], ["The rabbit is fast", "🐰"]],
    },
    d142: {
        id: "d142", title: "Describing People", unit: 14,
        vocab: [["tall", "", "🦒"], ["short", "", "🐧"], ["young", "", "🧒"], ["beautiful", "", "💐"], ["rich", "", "💰"], ["poor", "", "🫙"], ["thin", "", "🥢"], ["strong", "", "💪"]],
        phrases: [["My brother is very tall", "🦒"], ["She is young and beautiful", "💐"]],
    },
    d143: {
        id: "d143", title: "Personality", unit: 14,
        vocab: [["kind", "", "😇"], ["friendly", "", "🤗"], ["funny", "", "😂"], ["serious", "", "🧐"], ["lazy", "", "🦥"], ["hardworking", "", "🐝"], ["honest", "", "🤍"], ["smart", "", "🧠"]],
        phrases: [["My teacher is very kind", "😇"], ["He is funny and smart", "🧠"]],
    },
    // ── UNIT 15 (Trailblazer) ──
    d151: {
        id: "d151", title: "Emergencies", unit: 15,
        vocab: [["help", "", "🆘"], ["danger", "", "⚠️"], ["police", "", "👮"], ["fire", "", "🔥"], ["accident", "", "💥"], ["hurt", "", "🤕"], ["emergency", "", "🚨"], ["safe", "", "🛡️"]],
        phrases: [["I need help", "🆘"], ["Call the police", "👮"]],
    },
    d152: {
        id: "d152", title: "Phone & Tech", unit: 15,
        vocab: [["phone", "", "📱"], ["computer", "", "💻"], ["internet", "", "🌐"], ["message", "", "💬"], ["screen", "", "🖥️"], ["battery", "", "🔋"], ["password", "", "🔑"], ["download", "", "⬇️"]],
        phrases: [["The battery is low", "🔋"], ["I send you a message", "💬"]],
    },
    d153: {
        id: "d153", title: "Future Plans", unit: 15,
        vocab: [["plan", "", "🗓️"], ["goal", "", "🎯"], ["dream", "", "🌠"], ["maybe", "", "🤔"], ["soon", "", "⏳"], ["week", "", "📅"], ["month", "", "📆"], ["will", "", "✨"]],
        phrases: [["My dream is to travel", "✈️"], ["We will meet next week", "📅"]],
    },
    // ── UNIT 16 (Champion) ──
    d161: {
        id: "d161", title: "Shopping", unit: 16,
        vocab: [["buy", "", "🛒"], ["sell", "", "🏪"], ["price", "", "💰"], ["cheap", "", "🏷️"], ["expensive", "", "💸"], ["size", "", "📏"], ["pay", "", "💳"], ["cash", "", "💵"]],
        phrases: [["How much is this?", "💰"], ["I will pay by card", "💳"]],
    },
    d162: {
        id: "d162", title: "Making Requests", unit: 16,
        vocab: [["please", "", "🙏"], ["sorry", "", "😔"], ["excuse me", "", "🙋"], ["wait", "", "⏳"], ["may I", "", "🙇"], ["let me", "", "🤲"], ["can you", "", "🙏"], ["thank you", "", "💐"]],
        phrases: [["Can you open the window?", "🪟"], ["Excuse me, where is the exit?", "🚪"]],
    },
    d163: {
        id: "d163", title: "Giving Advice", unit: 16,
        vocab: [["should", "", "💡"], ["try", "", "🔄"], ["better", "", "👍"], ["careful", "", "⚠️"], ["important", "", "⭐"], ["remember", "", "🧠"], ["forget", "", "💤"], ["suggest", "", "💬"]],
        phrases: [["You should rest today", "😴"], ["Remember to call me", "📞"]],
    },
    // ── final deep lesson ──
    d171: {
        id: "d171", title: "Stories & Past", unit: 17,
        vocab: [["story", "", "📖"], ["day", "", "☀️"], ["came", "", "🚶"], ["saw", "", "👀"], ["went", "", "➡️"], ["met", "", "🤝"], ["before", "", "⏮️"], ["ago", "", "🕰️"]],
        phrases: [["Yesterday I met my friend", "🤝"], ["I went to the market", "🏪"]],
    },
    d172: {
        id: "d172", title: "Celebrations", unit: 17,
        vocab: [["birthday", "", "🎂"], ["party", "", "🎉"], ["gift", "", "🎁"], ["cake", "", "🍰"], ["candle", "", "🕯️"], ["celebrate", "", "🥳"], ["invitation", "", "💌"], ["holiday", "", "🏖️"]],
        phrases: [["Happy birthday!", "🎂"], ["We celebrate with a party", "🎉"]],
    },
};

// Unit plan: which lesson ids belong in each unit (core ids merged by buildCourses).
const UNIT_PLAN = [
    { title: "Rookie",         color: "#58cc02", lessons: ["basics", "greetings", "friends", "d11"] },
    { title: "Rookie II",      color: "#58cc02", lessons: ["d21", "d22", "d23", "d24"] },
    { title: "Explorer",       color: "#1cb0f6", lessons: ["food", "d31", "d32", "d33"] },
    { title: "Explorer II",    color: "#1cb0f6", lessons: ["d41", "d42", "colors", "d43"] },
    { title: "Adventurer",     color: "#ffc800", lessons: ["people", "d51", "d52", "d53"] },
    { title: "Adventurer II",  color: "#ffc800", lessons: ["d61", "d62", "d63", "travel"] },
    { title: "Pathfinder",     color: "#ce82ff", lessons: ["d71", "d72", "d73", "numbers"] },
    { title: "Pathfinder II",  color: "#ce82ff", lessons: ["d81", "d82", "d83", "d43"] },
    { title: "Voyager",        color: "#ff9600", lessons: ["d91", "d92", "d93", "d101"] },
    { title: "Voyager II",     color: "#ff9600", lessons: ["d102", "d103", "d111", "d112"] },
    { title: "Globetrotter",   color: "#00cd9c", lessons: ["d113", "d121", "d122", "d123"] },
    { title: "Globetrotter II", color: "#00cd9c", lessons: ["d131", "d132", "d133", "d141"] },
    { title: "Trailblazer",    color: "#1cb0f6", lessons: ["d142", "d143", "d151", "d152"] },
    { title: "Trailblazer II", color: "#1cb0f6", lessons: ["d153", "d161", "d162", "d163"] },
    { title: "Champion",       color: "#ffc800", lessons: ["d171", "d172", "d11", "d24"] },
];

module.exports = { LESSONS, UNIT_PLAN };