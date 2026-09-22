// ─────────────────────────────────────────────────────────────
// Education sub-app: non-language subjects.
//
// These courses reuse the whole learn engine (XP, streaks, leagues,
// crowns, hearts) but author their questions by hand instead of
// generating them from vocabulary. Question types:
//   mcq     — pick one of the options  (options + correctIndex)
//   solve   — type your answer; it's checked by the server schema
//             (accept[] + optional numeric tolerance) and the full,
//             narrated step-by-step solution is revealed.
//   truefalse — the same mcq renderer with True/False options.
// Each question may carry a `solution` array of { t, say } steps,
// where `say` is the narration script read aloud by the client.
// ─────────────────────────────────────────────────────────────

const L = (id, title, xp, difficulty, questions) => ({
    id, title, type: "lesson", xp, difficulty,
    vocab: [], phrases: [],
    questions,
});

const S = (id, title, lessons) => ({ id, title, lessons });

function TIER(d) {
    return d <= 2 ? "Beginner" : d <= 4 ? "Novice" : d <= 6 ? "Explorer" : d <= 8 ? "Advanced" : "Expert";
}
function COLOR(d) {
    return d <= 2 ? "#58cc02" : d <= 4 ? "#1cb0f6" : d <= 6 ? "#ffc800" : d <= 8 ? "#ce82ff" : "#ff9600";
}

// Pure chapter builder. `prefix` keeps lesson/step ids globally unique per course.
const mChapter = (prefix, n, title, difficulty, bundles) => ({
    id: `${prefix}-ch${n}`, chapter: n, title, theme: `level-${n}`,
    difficulty, tier: TIER(difficulty), color: COLOR(difficulty),
    steps: bundles.map((b, i) => S(`${prefix}-s${n}-${i + 1}`, b.title, b.lessons)),
});

// ─────────────────────────────────────────────────────────────
// MATHEMATICS  —  kindergarten → primary → middle → matriculation.
// "Which maths" (branch choice) is future scope; v1 ships the four
// progressive levels — each lesson opens with an MCQ warm-up, then
// typed solve questions whose solutions are narrated step by step.
// ─────────────────────────────────────────────────────────────

// Helper to author one lesson quickly.
const mL = (id, title, qs) => L(id, title, 12, 0, qs);
const M = { m: (p, opts, c, sol) => ({ type: "mcq", prompt: p, options: opts, correctIndex: c, solution: sol }),
           s: (p, accept, correct, sol, tol) => ({ type: "solve", prompt: p, accept, correct, solution: sol, ...(tol != null ? { tol } : {}) }) };

// ── Level 1 · Kindergarten ──
const MATHS_CH1 = mChapter("maths", 1, "Kindergarten · Counting & First Steps", 1, [
    { title: "Counting to 20", lessons: [
        mL("maths-kg-s1-l1", "Counting to 20", [
            M.m("How many fingers do you have on both hands?", ["5", "10", "15", "20"], 1, [{ t: "You have 5 fingers on each hand. 5 + 5 = 10.", say: "You have five fingers on each hand. Five plus five equals ten." }]),
            M.s("What number comes right after 4?", ["5"], "5", [{ t: "Count: 1, 2, 3, 4, then 5. So after 4 comes 5.", say: "Count: one, two, three, four, then five. So after four comes five." }]),
            M.m("Which is the biggest number?", ["7", "3", "9", "2"], 2, [{ t: "Compare sizes: 9 is the largest of the four.", say: "Nine is the largest of the four numbers." }]),
            M.s("What number comes right before 10?", ["9"], "9", [{ t: "Count backwards from 10: 10, then 9. So before 10 comes 9.", say: "Counting backwards from ten: ten, then nine." }]),
            M.m("Which number is smaller than 8?", ["9", "6", "8", "10"], 1, [{ t: "Of the choices, only 6 is less than 8.", say: "Only six is less than eight." }]),
        ]),
        mL("maths-kg-s2-l1", "Adding up to 10", [
            M.s("2 + 3 = ?", ["5"], "5", [{ t: "2 and 3 make 5.", say: "Two and three make five." }]),
            M.m("4 + 1 = …?", ["3", "5", "6", "9"], 1, [{ t: "Count on one more from 4: 5.", say: "Count one more from four: five." }]),
            M.s("5 + 5 = ?", ["10"], "10", [{ t: "5 and 5 make 10 — a full pair of hands.", say: "Five and five make ten." }]),
            M.s("What is 7 + 2?", ["9"], "9", [{ t: "Count on two more from 7: 8, 9.", say: "Count two more from seven: eight, nine." }]),
            M.m("6 + 3 = …?", ["8", "9", "10", "11"], 1, [{ t: "6, then count 3 more: 7, 8, 9.", say: "Six, then three more: seven, eight, nine." }]),
        ]),
        mL("maths-kg-s3-l1", "Taking away up to 10", [
            M.s("5 − 2 = ?", ["3"], "3", [{ t: "Take 2 away from 5: 3 are left.", say: "Take two away from five: three are left." }]),
            M.m("10 − 4 = …?", ["4", "5", "6", "7"], 2, [{ t: "Count back 4 from 10: 9, 8, 7, 6.", say: "Count back four from ten: nine, eight, seven, six." }]),
            M.s("9 − 3 = ?", ["6"], "6", [{ t: "9 minus 3 is 6.", say: "Nine minus three is six." }]),
            M.s("8 − 8 = ?", ["0"], "0", [{ t: "Taking everything away leaves nothing: 0.", say: "Taking everything away leaves zero." }]),
            M.m("7 − 1 = …?", ["5", "6", "7", "8"], 1, [{ t: "One less than 7 is 6.", say: "One less than seven is six." }]),
        ]),
        mL("maths-kg-s4-l1", "Bigger, smaller & counting patterns", [
            M.m("Which is the biggest number?", ["11", "8", "15", "13"], 2, [{ t: "15 is larger than 11, 13, and 8.", say: "Fifteen is the largest." }]),
            M.m("Which is the smallest number?", ["14", "9", "12", "17"], 1, [{ t: "9 is the smallest of the four.", say: "Nine is the smallest." }]),
            M.s("What number is one more than 11?", ["12"], "12", [{ t: "One more than 11 is 12.", say: "One more than eleven is twelve." }]),
            M.m("Count by twos: 2, 4, __", ["6", "8", "10", "12"], 0, [{ t: "The pattern adds 2 each step: 6.", say: "The pattern adds two each step: six." }]),
            M.m("Count by fives: 5, 10, 15, __", ["20", "25", "30", "35"], 0, [{ t: "Add 5 each step: 20.", say: "Add five each step: twenty." }]),
        ]),
        mL("maths-kg-s5-l1", "Shapes & number words", [
            M.m("How many sides does a triangle have?", ["2", "3", "4", "5"], 1, [{ t: "A triangle has 3 straight sides.", say: "A triangle has three straight sides." }]),
            M.m("Which shape has 4 equal sides?", ["Circle", "Square", "Triangle", "Star"], 1, [{ t: "A square has four equal sides.", say: "A square has four equal sides." }]),
            M.s("Write the number for “eight”", ["8"], "8", [{ t: "The number eight is written as 8.", say: "Eight is written as the digit eight." }]),
            M.m("How many corners does a square have?", ["3", "4", "5", "6"], 1, [{ t: "A square has 4 corners, one at each vertex.", say: "A square has four corners." }]),
            M.s("Write the number for “ten”", ["10"], "10", [{ t: "Ten is written as a 1 followed by a 0.", say: "Ten is written as one followed by a zero." }]),
        ]),
        mL("maths-kg-s6-l1", "Mix it up", [
            M.s("3 + 4 = ?", ["7"], "7", [{ t: "3 and 4 make 7.", say: "Three and four make seven." }]),
            M.s("9 − 5 = ?", ["4"], "4", [{ t: "Take 5 away from 9: 4 left.", say: "Five from nine leaves four." }]),
            M.m("1 + 1 + 1 = …?", ["1", "2", "3", "4"], 2, [{ t: "Three ones together make 3.", say: "Three ones make three." }]),
            M.s("6 + 6 = ?", ["12"], "12", [{ t: "6 and 6 make 12.", say: "Six and six make twelve." }]),
            M.m("Two ducks and three cats — how many animals?", ["2", "3", "5", "6"], 2, [{ t: "2 + 3 = 5 animals in total.", say: "Two plus three equals five animals." }]),
        ]),
    ]},
]);

// ── Level 2 · Primary ──
const MATHS_CH2 = mChapter("maths", 2, "Primary · Multiply, Divide & Fractions", 2, [
    { title: "Times tables (×2, ×5, ×10)", lessons: [
        mL("maths-pr-s1-l1", "Times tables (×2, ×5, ×10)", [
            M.s("What is 2 × 3?", ["6"], "6", [{ t: "2 × 3 means two groups of three: 6.", say: "Two times three is six." }]),
            M.s("What is 5 × 4?", ["20"], "20", [{ t: "Four lots of five make 20.", say: "Four lots of five make twenty." }]),
            M.s("What is 10 × 7?", ["70"], "70", [{ t: "Multiplying by 10 just adds a zero: 70.", say: "Multiplying by ten adds a zero: seventy." }]),
            M.m("2 × 8 = …?", ["14", "16", "18", "20"], 1, [{ t: "Doubling 8 gives 16.", say: "Doubling eight gives sixteen." }]),
            M.m("5 × 5 = …?", ["15", "20", "25", "30"], 2, [{ t: "5 × 5 = 25.", say: "Five times five is twenty-five." }]),
        ]),
        mL("maths-pr-s2-l1", "More multiplication", [
            M.s("3 × 4 = ?", ["12"], "12", [{ t: "3 × 4 = 12.", say: "Three times four is twelve." }]),
            M.s("6 × 2 = ?", ["12"], "12", [{ t: "6 × 2 = 12.", say: "Six times two is twelve." }]),
            M.m("7 × 2 = …?", ["12", "13", "14", "15"], 2, [{ t: "Double 7 is 14.", say: "Double seven is fourteen." }]),
            M.s("4 × 5 = ?", ["20"], "20", [{ t: "4 × 5 = 20.", say: "Four times five is twenty." }]),
            M.m("9 × 2 = …?", ["16", "18", "20", "22"], 1, [{ t: "Double 9 is 18.", say: "Double nine is eighteen." }]),
        ]),
        mL("maths-pr-s3-l1", "Division & sharing", [
            M.s("10 ÷ 2 = ?", ["5"], "5", [{ t: "10 split into 2 equal groups gives 5.", say: "Ten split into two groups gives five." }]),
            M.s("12 ÷ 3 = ?", ["4"], "4", [{ t: "12 shared between 3 gives 4 each.", say: "Twelve shared between three gives four." }]),
            M.m("Share 8 sweets equally between 2 friends. Each gets …", ["3", "4", "5", "6"], 1, [{ t: "8 ÷ 2 = 4 each.", say: "Eight sweets over two friends is four each." }]),
            M.s("20 ÷ 5 = ?", ["4"], "4", [{ t: "20 shared between 5 is 4 each.", say: "Twenty divided by five is four." }]),
            M.m("15 ÷ 3 = …?", ["3", "4", "5", "6"], 2, [{ t: "15 shared between 3 is 5.", say: "Fifteen divided by three is five." }]),
        ]),
        mL("maths-pr-s4-l1", "Fractions — halves & quarters", [
            M.m("Half of 10 is …", ["4", "5", "6", "7"], 1, [{ t: "Half of 10 is 5.", say: "Half of ten is five." }]),
            M.s("Half of 14 = ?", ["7"], "7", [{ t: "Half of 14 is 7.", say: "Half of fourteen is seven." }]),
            M.m("Which fraction means a half?", ["1/3", "1/2", "1/4", "2/2"], 1, [{ t: "1/2 means one part out of two — a half.", say: "One over two is a half." }]),
            M.s("One quarter (1/4) of 8 = ?", ["2"], "2", [{ t: "8 ÷ 4 = 2.", say: "A quarter of eight is two." }]),
            M.m("Two halves together make …", ["1 whole", "2 wholes", "Half", "Nothing"], 0, [{ t: "Two halves make one whole.", say: "Two halves make a whole." }]),
        ]),
        mL("maths-pr-s5-l1", "Money & time", [
            M.m("How many minutes are in one hour?", ["30", "60", "90", "100"], 1, [{ t: "1 hour = 60 minutes.", say: "One hour is sixty minutes." }]),
            M.m("How many hours are in a day?", ["12", "24", "36", "48"], 1, [{ t: "A day has 24 hours.", say: "A day has twenty-four hours." }]),
            M.s("You have 5 coins and find 3 more. How many coins now?", ["8"], "8", [{ t: "5 + 3 = 8 coins.", say: "Five plus three is eight coins." }]),
            M.m("How many days are in a week?", ["5", "7", "10", "12"], 1, [{ t: "A week has 7 days.", say: "A week has seven days." }]),
            M.m("How many quarters make one dollar?", ["2", "3", "4", "6"], 2, [{ t: "4 × 25¢ = $1.", say: "Four quarters make a dollar." }]),
        ]),
        mL("maths-pr-s6-l1", "Word problems", [
            M.s("3 red birds and 4 blue birds — how many birds in total?", ["7"], "7", [{ t: "3 + 4 = 7 birds.", say: "Three plus four is seven birds." }]),
            M.m("You eat 2 of your 7 sandwiches. How many are left?", ["4", "5", "6", "7"], 1, [{ t: "7 − 2 = 5 left.", say: "Seven minus two leaves five." }]),
            M.s("Each bag holds 5 books. How many books fit in 3 bags?", ["15"], "15", [{ t: "3 × 5 = 15 books.", say: "Three times five is fifteen books." }]),
            M.m("Share 12 stickers equally among 3 people. Each gets …", ["3", "4", "6", "9"], 1, [{ t: "12 ÷ 3 = 4 each.", say: "Twelve stickers over three people is four each." }]),
            M.m("A dozen eggs, and you use 4. How many eggs are left?", ["6", "7", "8", "10"], 2, [{ t: "A dozen is 12; 12 − 4 = 8.", say: "A dozen is twelve; eight remain." }]),
        ]),
    ]},
]);

// ── Level 3 · Middle School ──
const MATHS_CH3 = mChapter("maths", 3, "Middle School · Percentages, Algebra & Geometry", 4, [
    { title: "Percentages", lessons: [
        mL("maths-ms-s1-l1", "Percentages", [
            M.s("What is 10% of 50?", ["5"], "5", [{ t: "10% is one tenth: 50 ÷ 10 = 5.", say: "Ten percent is one tenth of fifty, which is five." }]),
            M.s("What is 50% of 80?", ["40"], "40", [{ t: "50% is half: 80 ÷ 2 = 40.", say: "Fifty percent is half of eighty, which is forty." }]),
            M.m("25% of 200 = …?", ["25", "40", "50", "75"], 2, [{ t: "25% is a quarter: 200 ÷ 4 = 50.", say: "Twenty-five percent is a quarter of two hundred, which is fifty." }]),
            M.s("A $40 shirt is 25% off. How many dollars do you save?", ["10"], "10", [{ t: "25% of 40 = 40 ÷ 4 = $10 saved.", say: "A quarter of forty is ten dollars saved." }]),
            M.m("You score 18 out of 20. What percent is that?", ["80%", "90%", "95%", "100%"], 1, [{ t: "18/20 = 0.9 = 90%.", say: "Eighteen out of twenty is ninety percent." }]),
        ]),
        mL("maths-ms-s2-l1", "Fractions & decimals", [
            M.m("1/2 written as a decimal is …", ["0.1", "0.25", "0.5", "0.75"], 2, [{ t: "1/2 = 0.5.", say: "One half is zero point five." }]),
            M.s("Write 0.25 as a fraction (e.g. 1/4)", ["1/4"], "1/4", [{ t: "0.25 = 25/100 = 1/4.", say: "Zero point two five is one quarter." }]),
            M.s("3/4 as a decimal = ?", ["0.75"], "0.75", [{ t: "3/4 = 0.75.", say: "Three quarters is zero point seven five." }]),
            M.m("Which is the largest?", ["0.1", "0.05", "0.3", "0.25"], 2, [{ t: "0.3 is larger than 0.25, 0.1 and 0.05.", say: "Zero point three is the largest." }]),
            M.s("0.5 + 0.25 = ?", ["0.75"], "0.75", [{ t: "0.5 + 0.25 = 0.75.", say: "Zero point five plus zero point two five is zero point seven five." }]),
        ]),
        mL("maths-ms-s3-l1", "Algebra basics", [
            M.m("If x = 3, what is x + 4?", ["5", "6", "7", "8"], 2, [{ t: "x + 4 = 3 + 4 = 7.", say: "Three plus four is seven." }]),
            M.s("Solve for x: x + 5 = 12", ["7"], "x = 7", [{ t: "Subtract 5 from both sides: x = 12 − 5 = 7.", say: "Subtract five from both sides: x equals ten two minus five, which is seven." }]),
            M.s("Solve for y: 2y = 10", ["5"], "y = 5", [{ t: "Divide both sides by 2: y = 5.", say: "Divide both sides by two: y is five." }]),
            M.m("If n = 2, what is 3 × n + 1?", ["5", "6", "7", "8"], 2, [{ t: "3 × 2 + 1 = 6 + 1 = 7.", say: "Three times two plus one is seven." }]),
            M.s("Simplify: 3a + 2a", ["5a"], "5a", [{ t: "Add the coefficients: 3 + 2 = 5, so 5a.", say: "Three a plus two a is five a." }]),
        ]),
        mL("maths-ms-s4-l1", "Area & perimeter", [
            M.s("A rectangle is 6 cm long and 4 cm wide. Perimeter (cm)?", ["20"], "20", [{ t: "Perimeter = 2×(6+4) = 2×10 = 20 cm.", say: "Perimeter is two times length plus width: two times ten is twenty." }]),
            M.s("Area of that rectangle? (length × width)", ["24"], "24", [{ t: "Area = 6 × 4 = 24 cm².", say: "Six times four is twenty-four square centimetres." }]),
            M.m("A square has side 5 m. Its area is …", ["10 m²", "20 m²", "25 m²", "50 m²"], 2, [{ t: "Area = 5 × 5 = 25 m².", say: "Five times five is twenty-five." }]),
            M.s("Area of a triangle with base 8 and height 5? (base × height ÷ 2)", ["20"], "20", [{ t: "8 × 5 ÷ 2 = 40 ÷ 2 = 20.", say: "Eight times five is forty, halved is twenty." }]),
            M.m("Perimeter of a square with side 3 m?", ["6 m", "9 m", "12 m", "15 m"], 2, [{ t: "Perimeter = 4 × side = 12 m.", say: "Four sides of three metres gives twelve." }]),
        ]),
        mL("maths-ms-s5-l1", "Averages", [
            M.s("Mean (average) of 2, 4, 6 = ?", ["4"], "4", [{ t: "Sum = 12, count = 3, mean = 12 ÷ 3 = 4.", say: "Twelve divided by three is four." }]),
            M.m("Mean of 3, 5, 7 = …?", ["3", "5", "6", "7"], 1, [{ t: "Sum = 15, mean = 15 ÷ 3 = 5.", say: "Fifteen divided by three is five." }]),
            M.s("Mean of 10, 20, 30 = ?", ["20"], "20", [{ t: "Sum 60 ÷ 3 = 20.", say: "Sixty divided by three is twenty." }]),
            M.m("Test scores 5, 6, 7 — the average is …", ["5", "6", "7", "8"], 1, [{ t: "18 ÷ 3 = 6.", say: "Eighteen divided by three is six." }]),
            M.s("Range of 3, 9, 9, 1, 4? (largest − smallest)", ["8"], "8", [{ t: "9 − 1 = 8.", say: "Nine minus one is eight." }]),
        ]),
        mL("maths-ms-s6-l1", "Rates & proportion", [
            M.s("6 pencils cost $3. What does 1 pencil cost ($)?", ["0.5"], "0.5", [{ t: "3 ÷ 6 = 0.5 → 50¢.", say: "Three divided by six is zero point five dollars." }], 0.001),
            M.m("A car goes 60 km in 1 hour. How far in 3 hours?", ["90 km", "120 km", "150 km", "180 km"], 3, [{ t: "60 × 3 = 180 km.", say: "Sixty times three is one hundred and eighty." }]),
            M.s("On a map, 1 cm = 10 km. How many km is 3 cm?", ["30"], "30", [{ t: "3 × 10 = 30 km.", say: "Three times ten is thirty kilometres." }]),
            M.m("4 apples cost $2. How much for 8 apples?", ["$2", "$3", "$4", "$6"], 2, [{ t: "8 is double 4, so cost doubles: $4.", say: "Eight apples is double four, so four dollars." }]),
            M.s("You work 5 hours at $6 per hour. Total pay ($)?", ["30"], "30", [{ t: "5 × 6 = $30.", say: "Five times six is thirty dollars." }]),
        ]),
    ]},
]);

// ── Level 4 · Matriculation ──
const MATHS_CH4 = mChapter("maths", 4, "Matriculation · Algebra, Quadratics, Probability, Trig", 6, [
    { title: "Linear equations", lessons: [
        mL("maths-mat-s1-l1", "Linear equations", [
            M.s("Solve: 2x + 3 = 11. x = ?", ["4"], "x = 4", [{ t: "Subtract 3: 2x = 8; divide by 2: x = 4.", say: "Subtract three to get two x equals eight, then halve to get four." }]),
            M.s("Solve: 5y − 7 = 13. y = ?", ["4"], "y = 4", [{ t: "Add 7: 5y = 20; divide by 5: y = 4.", say: "Add seven to get five y equals twenty, divide by five gives four." }]),
            M.m("Which value satisfies x ÷ 2 = 6?", ["2", "3", "12", "14"], 2, [{ t: "x = 6 × 2 = 12.", say: "x is six times two, which is twelve." }]),
            M.s("Solve: 3(x + 1) = 12. x = ?", ["3"], "x = 3", [{ t: "x + 1 = 4, so x = 3.", say: "x plus one is four, so x is three." }]),
            M.s("Solve: 4a = 28. a = ?", ["7"], "a = 7", [{ t: "28 ÷ 4 = 7.", say: "Twenty-eight divided by four is seven." }]),
        ]),
        mL("maths-mat-s2-l1", "Quadratics", [
            M.s("Solve x² = 49 for the positive x.", ["7"], "x = 7", [{ t: "The positive root of 49 is 7.", say: "The positive square root of forty-nine is seven." }]),
            M.m("Which factor pair multiplies to 12 and adds to 7?", ["(2, 6)", "(3, 4)", "(1, 12)", "(4, 8)"], 1, [{ t: "3 × 4 = 12 and 3 + 4 = 7.", say: "Three and four multiply to twelve and add to seven." }]),
            M.s("x² = 81, take the positive x.", ["9"], "x = 9", [{ t: "9² = 81.", say: "Nine squared is eighty-one." }]),
            M.m("(x + 2)(x + 3) expands to …", ["x² + 5x + 6", "x² + 6x + 5", "x² + 6", "x² + 5"], 0, [{ t: "x² + 3x + 2x + 6 = x² + 5x + 6.", say: "x squared plus three x plus two x plus six." }]),
            M.s("Solve x² − 9 = 0 for the positive x.", ["3"], "x = 3", [{ t: "x² = 9, positive root 3.", say: "x squared is nine, positive root three." }]),
        ]),
        mL("maths-mat-s3-l1", "Probability", [
            M.s("Rolling a fair 6-sided die: chance of a 4 (type as a/b)", ["1/6"], "1/6", [{ t: "One favourable face out of six.", say: "One favourable face out of six." }]),
            M.s("Chance of a coin landing heads (as a fraction)?", ["1/2"], "1/2", [{ t: "One of two equally likely outcomes.", say: "One of two equally likely outcomes." }]),
            M.m("A bag has 3 red and 2 blue marbles. Chance of picking red?", ["2/5", "3/5", "1/3", "1/2"], 1, [{ t: "3 red out of 5 total.", say: "Three red out of five." }]),
            M.m("Two coins tossed: chance of both landing heads?", ["1/2", "1/3", "1/4", "1/8"], 2, [{ t: "1/2 × 1/2 = 1/4.", say: "One half times one half is one quarter." }]),
            M.s("An impossible event has probability …", ["0", "0/1", "0.0"], "0", [{ t: "Impossible events have probability 0.", say: "An impossible event has probability zero." }]),
        ]),
        mL("maths-mat-s4-l1", "Trigonometry basics", [
            M.m("In a right triangle, opposite ÷ hypotenuse is …", ["cos", "sin", "tan", "1"], 1, [{ t: "sin(θ) = opposite/hypotenuse.", say: "Sine is opposite over hypotenuse." }]),
            M.s("sin(30°) = ? (as 0.5 or 1/2)", ["0.5", "1/2"], "0.5", [{ t: "sin(30°) = 1/2.", say: "Sine of thirty degrees is one half." }], 0.001),
            M.m("cos(60°) = …?", ["0", "0.25", "0.5", "1"], 2, [{ t: "cos(60°) = 0.5.", say: "Cosine of sixty degrees is zero point five." }]),
            M.m("tan(45°) = …?", ["0", "0.5", "1", "2"], 2, [{ t: "tan(45°) = 1.", say: "Tangent of forty-five degrees is one." }]),
            M.m("In a right triangle, the longest side is called the …", ["Leg", "Hypotenuse", "Base", "Height"], 1, [{ t: "The hypotenuse is opposite the right angle and longest.", say: "The hypotenuse is the longest side." }]),
        ]),
        mL("maths-mat-s5-l1", "Powers & logs", [
            M.s("2³ = ?", ["8"], "8", [{ t: "2 × 2 × 2 = 8.", say: "Two times two times two is eight." }]),
            M.m("10² = …?", ["10", "20", "100", "1024"], 2, [{ t: "10 × 10 = 100.", say: "Ten squared is one hundred." }]),
            M.s("Simplify: 2x + 3x − x", ["4x"], "4x", [{ t: "2 + 3 − 1 = 4, so 4x.", say: "Collect terms to get four x." }]),
            M.m("y = 2x + 1. When x = 3, y = …?", ["5", "6", "7", "8"], 2, [{ t: "y = 2×3 + 1 = 7.", say: "Two times three plus one is seven." }]),
            M.m("log₁₀(1000) = …?", ["1", "2", "3", "4"], 2, [{ t: "10³ = 1000, so log₁₀(1000) = 3.", say: "Ten cubed is a thousand, so the logarithm is three." }]),
        ]),
        mL("maths-mat-s6-l1", "Matriculation practice", [
            M.s("A shirt costs $80 after a 20% discount. What was the original price?", ["100"], "$100", [{ t: "Let the original be p: 0.8p = 80 → p = 100.", say: "Eighty percent of the price is eighty dollars, so the price was one hundred." }]),
            M.s("The mean of 5 numbers is 12. What is their sum?", ["60"], "60", [{ t: "Sum = mean × count = 12 × 5 = 60.", say: "Twelve times five is sixty." }]),
            M.m("Distance = speed × time. 60 km/h for 2.5 h → km?", ["120", "150", "160", "200"], 1, [{ t: "60 × 2.5 = 150 km.", say: "Sixty times two point five is one hundred and fifty." }]),
            M.s("Simple interest on $200 at 5% for 1 year = $?", ["10"], "10", [{ t: "200 × 0.05 = $10.", say: "Two hundred times five percent is ten dollars." }]),
            M.m("Two angles of a triangle are 60° and 70°. The third is …", ["40°", "50°", "60°", "70°"], 1, [{ t: "180 − 130 = 50°.", say: "Angles in a triangle add to one eighty, so the third is fifty degrees." }]),
        ]),
    ]},
]);

const MATHS_CHAPTERS = [MATHS_CH1, MATHS_CH2, MATHS_CH3, MATHS_CH4];

// ─────────────────────────────────────────────────────────────
// IQ TEST — reason about numbers, words and patterns.
// ─────────────────────────────────────────────────────────────
const iqLessons = [
    mChapter("iq", 1, "Numerical reasoning", 2, [
        { title: "Number sequences", lessons: [
            mL("iq-num-s1-l1", "Number sequences", [
                M.m("2, 4, 6, 8, … ?", ["9", "10", "12", "14"], 1, [{ t: "Add 2 each step → 10.", say: "Add two each step: ten." }]),
                M.m("1, 2, 4, 8, … ?", ["10", "12", "14", "16"], 3, [{ t: "Double each step → 16.", say: "Double each step: sixteen." }]),
                M.m("100, 90, 80, … ?", ["60", "70", "75", "85"], 1, [{ t: "Subtract 10 each step → 70.", say: "Subtract ten each step: seventy." }]),
                M.s("3, 6, 9, … next number?", ["12"], "12", [{ t: "Add 3 each step → 12.", say: "Add three each step: twelve." }]),
                M.m("1, 4, 9, 16, … ?", ["20", "23", "25", "36"], 2, [{ t: "Square numbers: 1², 2², 3², 4², so 5² = 25.", say: "These are square numbers; five squared is twenty-five." }]),
            ]),
            mL("iq-num-s2-l1", "Arithmetic reasoning", [
                M.s("A pen costs 5 and a book costs 12. What is the total?", ["17"], "17", [{ t: "5 + 12 = 17.", say: "Five plus twelve is seventeen." }]),
                M.m("Which number is the odd one out?", ["2", "4", "6", "9"], 3, [{ t: "9 is the only odd number.", say: "Nine is the only odd number." }]),
                M.m("I think of a number; doubling it gives 18. The number is …", ["6", "8", "9", "10"], 2, [{ t: "18 ÷ 2 = 9.", say: "Half of eighteen is nine." }]),
                M.s("15 minus 7, then add 3 = ?", ["11"], "11", [{ t: "15 − 7 = 8; 8 + 3 = 11.", say: "Fifteen minus seven is eight, plus three is eleven." }]),
                M.m("0, 1, 1, 2, 3, 5, … ?", ["7", "8", "10", "11"], 1, [{ t: "Fibonacci: each term sums the previous two → 8.", say: "Five plus three is eight." }]),
            ]),
            mL("iq-num-s3-l1", "Money & everyday numbers", [
                M.m("Three apples cost 6. Each apple costs …", ["1", "2", "3", "4"], 1, [{ t: "6 ÷ 3 = 2.", say: "Six divided by three is two." }]),
                M.m("A movie ends after 2 hours, starting at 7:00 pm. End time?", ["8 pm", "9 pm", "10 pm", "11 pm"], 1, [{ t: "7 + 2 = 9 pm.", say: "Seven plus two is nine o'clock." }]),
                M.s("If today is Monday, what day is it in 3 days?", ["thursday"], "Thursday", [{ t: "Mon → Tue → Wed → Thu.", say: "Monday, Tuesday, Wednesday, Thursday." }]),
                M.m("2, 5, 8, …, 14", ["10", "11", "12", "13"], 1, [{ t: "Add 3 each step: 11.", say: "Add three each step: eleven." }]),
                M.m("1 dozen = …?", ["10", "12", "15", "20"], 1, [{ t: "A dozen is 12.", say: "A dozen is twelve." }]),
            ]),
        ]},
    ]),
    mChapter("iq", 2, "Verbal reasoning", 3, [
        { title: "Word relations", lessons: [
            mL("iq-verb-s1-l1", "Word relations", [
                M.m("Cat is to Kitten as Dog is to …", ["Puppy", "Kitten", "Cub", "Calf"], 0, [{ t: "A baby dog is a puppy.", say: "A baby dog is a puppy." }]),
                M.m("Opposite of “ancient” is …", ["New", "Old", "Huge", "Wise"], 0, [{ t: "Ancient means very old; the opposite is new.", say: "Ancient means very old, so the opposite is new." }]),
                M.m("Book is to Read as Food is to …", ["Cook", "Eat", "Kitchen", "Flip"], 1, [{ t: "You eat food, just as you read a book.", say: "You eat food." }]),
                M.m("Which word does not belong?", ["Apple", "Banana", "Carrot", "Grape"], 2, [{ t: "A carrot is a vegetable; the rest are fruit.", say: "A carrot is a vegetable." }]),
                M.m("Pen is to Write as Scissors is to …", ["Cut", "Paper", "Sharp", "Glue"], 0, [{ t: "Scissors are used to cut.", say: "Scissors are used to cut." }]),
            ]),
            mL("iq-verb-s2-l1", "Analogies & classification", [
                M.m("Water : Ocean :: Sand : …", ["Beach", "Glass", "Desert", "Sea"], 2, [{ t: "Sand makes up a desert, just as water forms an ocean.", say: "Sand makes up a desert." }]),
                M.m("Clock : Time :: Thermometer : …", ["Cold", "Degrees", "Temperature", "Weather"], 2, [{ t: "A thermometer measures temperature.", say: "A thermometer measures temperature." }]),
                M.m("Which is the odd one out?", ["Cow", "Tiger", "Lion", "Wolf"], 0, [{ t: "A cow is a farm animal; the rest are wild predators.", say: "A cow is a farm animal." }]),
                M.m("All flowers are plants. All roses are flowers. Therefore …", ["All roses are plants", "All plants are roses", "Some plants are roses", "Roses are not plants"], 0, [{ t: "Roses are flowers, and all flowers are plants.", say: "All roses are plants." }]),
                M.m("“Bright” most nearly means …", ["Dark", "Shiny", "Loud", "Slow"], 1, [{ t: "Bright means full of light — shiny.", say: "Bright means shiny." }]),
            ]),
            mL("iq-verb-s3-l1", "Reading logic", [
                M.m("Anna is taller than Ben. Ben is taller than Cia. Who is shortest?", ["Anna", "Ben", "Cia", "Can't tell"], 2, [{ t: "Cia < Ben < Anna.", say: "Cia is shortest." }]),
                M.m("In a queue of 5, you are 3rd. How many people wait behind you?", ["1", "2", "3", "4"], 1, [{ t: "5 − 3 = 2 behind.", say: "Two people are behind you." }]),
                M.m("A square has … corners", ["3", "4", "5", "8"], 1, [{ t: "A square has 4 corners.", say: "A square has four corners." }]),
                M.m("Eve is 2 years older than her sister. Eve is 12. Her sister is …", ["8", "10", "11", "14"], 1, [{ t: "12 − 2 = 10.", say: "Twelve minus two is ten." }]),
                M.m("North is to South as Up is to …", ["Down", "Top", "Above", "Sky"], 0, [{ t: "Opposites.", say: "Up and down are opposites." }]),
            ]),
        ]},
    ]),
    mChapter("iq", 3, "Spatial & logical reasoning", 4, [
        { title: "Patterns & shapes", lessons: [
            mL("iq-spa-s1-l1", "Patterns & shapes", [
                M.m("Circle, square, circle, square, … ?", ["Circle", "Square", "Triangle", "Star"], 0, [{ t: "The pattern alternates; a circle comes next.", say: "The pattern alternates to a circle." }]),
                M.m("A cube has how many faces?", ["4", "6", "8", "12"], 1, [{ t: "A cube has 6 faces.", say: "A cube has six faces." }]),
                M.m("The mirror image of → is …", ["←", "→", "↑", "↓"], 0, [{ t: "A mirror flips it to point left.", say: "It points left." }]),
                M.m("Which shape has the most sides?", ["Triangle", "Pentagon", "Square", "Hexagon"], 3, [{ t: "Hexagon has 6 sides — the most.", say: "A hexagon has six sides." }]),
                M.m("Is this statement true or false? “An L rotated 90° still looks like an L.”", ["True", "False"], 0, [{ t: "Rotating doesn't change the shape's essential look.", say: "Rotation preserves the L shape." }]),
            ]),
            mL("iq-spa-s2-l1", "Direction & puzzles", [
                M.m("Walk 10 steps north, then 5 steps south. How far are you from the start?", ["3 steps", "5 steps", "6 steps", "10 steps"], 1, [{ t: "10 − 5 = 5 steps north.", say: "Ten minus five is five." }]),
                M.m("If today is Tuesday, the day after tomorrow is …", ["Wednesday", "Thursday", "Friday", "Saturday"], 1, [{ t: "Tomorrow is Wednesday, then Thursday.", say: "The day after tomorrow is Thursday." }]),
                M.m("How many letters are in the word “WATERMELON”?", ["8", "9", "10", "11"], 2, [{ t: "W-A-T-E-R-M-E-L-O-N = 10.", say: "Watermelon has ten letters." }]),
                M.m("Next letter: A, C, E, G, … ?", ["H", "I", "J", "K"], 1, [{ t: "Skip one letter each step: I.", say: "Skip one letter: I." }]),
                M.m("Two fathers and two sons went fishing, but only 3 people went. How?", ["One person is both a father and a son", "They lied", "A count was wrong", "Not possible"], 0, [{ t: "Grandfather, father and son — the father is both a son and a father.", say: "The middle man is both father and son." }]),
            ]),
            mL("iq-spa-s3-l1", "Odds & logic", [
                M.m("Which number does not belong?", ["3", "5", "8", "13"], 2, [{ t: "8 is the only even number.", say: "Eight is the only even number." }]),
                M.s("How many 1×1 squares are on a full chessboard? (8 × 8)", ["64"], "64", [{ t: "8 rows × 8 columns = 64 squares.", say: "Eight by eight is sixty-four." }]),
                M.m("How many minutes are in 2.5 hours?", ["120", "150", "180", "250"], 1, [{ t: "2.5 × 60 = 150.", say: "Two and a half hours is one hundred fifty minutes." }]),
                M.m("Which is bigger: 7/8 or 0.85?", ["7/8", "0.85", "They are equal", "Can't tell"], 0, [{ t: "7/8 = 0.875 > 0.85.", say: "Seven eighths is zero point eight seven five." }]),
                M.m("Which word does not rhyme with the others?", ["Shoe", "Blue", "Glue", "Fish"], 3, [{ t: "Fish rhymes with none of them.", say: "Fish does not rhyme." }]),
            ]),
        ]},
    ]),
];

// ─────────────────────────────────────────────────────────────
// CHARACTER TEST — values & judgement. Questions have a best
// answer with the reasoning behind it explained after you answer.
// ─────────────────────────────────────────────────────────────
const charLessons = [
    mChapter("character", 1, "Honesty", 2, [
        { title: "Honesty in small moments", lessons: [
            mL("char-hon-s1-l1", "Found something", [
                M.m("You find a wallet with cash. Best move?", ["Keep it — finders keepers", "Hand it to the shop/security", "Take the cash, drop the wallet", "Ask a friend what to do"], 1, [{ t: "Handing it in gives the owner a fair chance to get it back.", say: "Handing it in gives the owner a chance." }]),
                M.m("The shop gives you too much change. You should …", ["Say nothing and keep it", "Point it out and return the extra", "Leave quickly", "Buy something else to use it"], 1, [{ t: "Returning the mistake builds trust and honesty.", say: "Returning the extra change is honest." }]),
                M.m("You forgot homework but the teacher didn't ask. Best choice?", ["Say nothing", "Tell the truth you forgot it", "Blame a sibling", "Hand in a blank pad"], 1, [{ t: "Owning up beats being caught — honesty keeps trust.", say: "Telling the truth keeps trust." }]),
                M.m("You see a classmate copy in an exam. What's fair?", ["Copy too", "Stay quiet forever", "Tell the teacher privately", "Shout it out loud"], 2, [{ t: "Reporting privately protects everyone's results fairly.", say: "Report privately and fairly." }]),
                M.m("You borrowed money and your friend forgot. You should …", ["Remind and pay it back", "Pretend you never borrowed", "Borrow more", "Wait until asked"], 0, [{ t: "Paying back keeps friendship honest.", say: "Pay back what you borrowed." }]),
            ]),
            mL("char-hon-s2-l1", "Everyday truth", [
                M.m("You broke a plate at home. Nobody saw. Best move?", ["Hide the pieces", "Blame the pet", "Tell your family honestly", "Say nothing"], 2, [{ t: "Accidents happen; honesty about them is what matters.", say: "Own up to accidents honestly." }]),
                M.m("A friend asks if you liked their drawing. You didn't. Kind choice?", ["Say it's perfect", "Say you don't care", "Say something kind but true, and suggest one improvement", "Laugh"], 2, [{ t: "Kind-but-true feedback helps friends grow.", say: "Be kind but truthful." }]),
                M.m("Your little brother broke something and is scared. You…", ["Take the blame to save him", "Tell the truth — it was him", "Say nothing", "Hide it"], 0, [{ t: "Sometimes protecting someone shows honesty-of-care; but telling the truth together is best.", say: "Stand by him and tell the truth together." }]),
                M.m("You overestimated how strong you are at a sport. The right view?", ["Quit forever", "Admit you're learning and keep practicing", "Brag anyway", "Blame the equipment"], 1, [{ t: "Honest self-appraisal is the start of getting better.", say: "Admit you are learning and keep practicing." }]),
                M.m("A stranger says a friend said a mean thing. What's wise?", ["Believe it instantly", "Spread it", "Check with the friend calmly", "Ignore forever"], 2, [{ t: "Verifying facts avoids hurt rumors.", say: "Check with the friend calmly." }]),
            ]),
        ]},
    ]),
    mChapter("character", 2, "Kindness", 2, [
        { title: "Looking out for others", lessons: [
            mL("char-kin-s1-l1", "Someone needs help", [
                M.m("A classmate drops their books in the hall. You …", ["Walk past", "Stop and help pick them up", "Point and laugh", "Tell them to hurry"], 1, [{ t: "A small helping hand is kindness in action.", say: "Stop and help." }]),
                M.m("A new student sits alone. You can …", ["Leave them", "Invite them to join your table", "Make them introduce themselves to everyone", "Compare them"], 1, [{ t: "Inviting someone in turns a group into a community.", say: "Invite them in." }]),
                M.m("A friend is sad after losing a game. Kind move?", ["Winning matters; move on", "Tease them lightly", "Hear them out and say something reassuring", "Change the subject loudly"], 2, [{ t: "Listening and reassurance help people recover.", say: "Listen and reassure." }]),
                M.m("Someone is blamed for something you know they didn't do. You …", ["Stay silent", "Say what you saw", "Blame someone else", "Joke about it"], 1, [{ t: "Speaking up for truth protects someone innocent.", say: "Say what you saw." }]),
                M.m("A friend is struggling with a topic you understand. You can …", ["Brag about your grade", "Offer to explain it", "Say it's easy", "Avoid them"], 1, [{ t: "Sharing understanding lifts others without costing you.", say: "Offer to explain it." }]),
            ]),
            mL("char-kin-s2-l1", "Kindness in hard moments", [
                M.m("You're in a group chat where another kid is being mocked. Best move?", ["Send laughing reactions", "Stay quiet", "Privately defend the kid / change the topic", "Leave angrily for drama"], 2, [{ t: "A quiet kind word can stop a spiral of bullying.", say: "Privately defend or change the topic." }]),
                M.m("An elderly neighbor carries heavy bags. You …", ["Watch from the window", "Offer to help carry them", "Wait to be asked twice", "Send your dog out"], 1, [{ t: "Offering once is enough — it shows care.", say: "Offer to help." }]),
                M.m("Your friend's team lost the final. You say …", ["“We knew you'd lose”", "Nothing", "“You played really well today”", "“Better luck next century”"], 2, [{ t: "Acknowledging effort, not only results, is kindness.", say: "Praise the effort." }]),
                M.m("Someone gives you a gift you don't like. You …", ["Tell them you hate it", "Thank them warmly", "Regift it in front of them", "Shrug"], 1, [{ t: "Gratitude is about the thought, not the object.", say: "Thank them warmly." }]),
                M.m("A teammate keeps failing and is upset. You …", ["Ask to swap teams", "Practice extra with them", "List their mistakes loudly", "Ignore them"], 1, [{ t: "Practicing together helps both of you improve.", say: "Practice with them." }]),
            ]),
        ]},
    ]),
    mChapter("character", 3, "Discipline & responsibility", 2, [
        { title: "Follow-through matters", lessons: [
            mL("char-disc-s1-l1", "Keeping promises", [
                M.m("You promised to help a friend move, then got an invite to play. You …", ["Go play", "Help first, text that you'll be late to play", "Say you're sick", "Forget the promise"], 1, [{ t: "A kept promise is what makes people trust you.", say: "Keep your promise first." }]),
                M.m("Homework is due in 20 minutes and you haven't started. Best move?", ["Copy a friend", "Do your best in the time left", "Skip school tomorrow", "Blame the teacher"], 1, [{ t: "Doing your best beats shortcuts — shortcuts teach nothing.", say: "Do your best with the time left." }]),
                M.m("You planned to run today but it's cold. Discipline looks like …", ["Skip it — it's cold", "Run a shorter route today", "Quit running forever", "Run tomorrow; skip today"], 1, [{ t: "Adjusting, not quitting, is how discipline survives.", say: "Shorter is still showing up." }]),
                M.m("You get angry in an argument. The disciplined choice is …", ["Yell louder", "Take a breath and pause before replying", "Slam the door", "Post about it"], 1, [{ t: "A pause between feeling and action is self-control.", say: "Pause before replying." }]),
                M.m("You saved money for a goal, but a sale tempts you. Best move?", ["Spend it all", "Spend a little, save the rest for the goal", "Borrow to buy more", "Forget the goal"], 1, [{ t: "Balancing fun and goals keeps both working.", say: "Spend a little, save the rest." }]),
            ]),
            mL("char-disc-s2-l1", "Responsibility", [
                M.m("You wake up late for an important school day. You …", ["Stay in bed", "Hurry up, apologize, and get there", "Blame the alarm", "Say school is pointless"], 1, [{ t: "Owning the fix, not the excuse, shows responsibility.", say: "Hurry, apologize, show up." }]),
                M.m("Your phone died before telling family you're safe. Next time you…", ["Do nothing", "Tell them a set time you'll check in", "Blame the battery forever", "Turn it off always"], 1, [{ t: "A simple habit protects the people who worry about you.", say: "Set a check-in time." }]),
                M.m("You made a mistake on a group project. Responsible move?", ["Pretend it wasn't yours", "Fix it and tell the group", "Delete the evidence", "Quit the project"], 1, [{ t: "Acknowledging and fixing errors earns more trust than hiding them.", say: "Fix it and tell the group." }]),
                M.m("You see water wasting in the school garden. You …", ["Walk past", "Close the tap and mention it", "Play in the water", "Add more water"], 1, [{ t: "Small responsible actions protect shared things.", say: "Close the tap." }]),
                M.m("A friend pressures you to do something risky. Best response?", ["Do it to fit in", "Say no and suggest a safer plan", "Dare them back", "Do it but only half"], 1, [{ t: "Assertive refusal respects yourself and your friend.", say: "Say no kindly and offer a safer plan." }]),
            ]),
            mL("char-disc-s3-l1", "Self-discipline", [
                M.m("You want to watch videos but you have a study plan. You …", ["Binge now, panic later", "Schedule videos after the study block", "Delete all apps forever", "Study while watching both badly"], 1, [{ t: "Planned rewards make discipline sustainable.", say: "Schedule play after work." }]),
                M.m("You said you'd read 10 pages a night. A busy day came. You…", ["Quit the streak", "Read just 2 pages", "Read 10 the next day", "Skip and lie about it"], 1, [{ t: "Kept small, a habit survives busy days.", say: "Read two pages — keep the habit alive." }]),
                M.m("You're tired but your room is a mess. Better choice?", ["Sleep; it's not urgent", "Tidy just the bed quickly", "Ignore it for a month", "Get angry at everyone"], 1, [{ t: "A tiny tidy keeps the space and your mood healthy.", say: "Tidy just a small part." }]),
                M.m("Your friend wants to skip practice together. You both have a match. You…", ["Skip together", "Skip because they are", "Go to practice, invite them along", "Argue loudly"], 2, [{ t: "Leading by example is more convincing than arguing.", say: "Go, and invite them along." }]),
                M.m("You made a mistake answering a question in class. You …", ["Hide and never answer again", "Laugh and answer next time anyway", "Blame the question", "Stop coming to class"], 1, [{ t: "Mistakes are data; trying again is the discipline.", say: "Shrug it off and answer next time." }]),
            ]),
        ]},
    ]),
];

// ─────────────────────────────────────────────────────────────
// Assemble subject courses.
// ─────────────────────────────────────────────────────────────
function toCourse(chapters) {
    return { chapters };
}

const SUBJECT_COURSES = {
    maths: toCourse(MATHS_CHAPTERS),
    iq: toCourse(iqLessons),
    character: toCourse(charLessons),
};

const SUBJECT_CATALOG = [
    {
        id: "maths",
        name: "Mathematics",
        flag: "🧮",
        nativeName: "Kindergarten → Matriculation",
        subject: "math",
        hl: "en",
        rtl: false,
        spaced: false,
        mode: "solve",
        blurb: "MCQ warm-up, then step-by-step narrated solutions, then typed exercises with full answer reveal.",
    },
    {
        id: "iq",
        name: "IQ Test",
        flag: "🧠",
        nativeName: "Numerical · verbal · spatial",
        subject: "iq",
        hl: "en",
        rtl: false,
        spaced: false,
        mode: "mcq",
        blurb: "Timed-feeling reasoning puzzles across numbers, words and shapes.",
    },
    {
        id: "character",
        name: "Character Test",
        flag: "🪞",
        nativeName: "Honesty · kindness · discipline",
        subject: "character",
        hl: "en",
        rtl: false,
        spaced: false,
        mode: "mcq",
        blurb: "Values and judgement scenarios, each with the reasoning behind the best answer.",
    },
];

module.exports = { SUBJECT_CATALOG, SUBJECT_COURSES };

// Keep node -e consumers happy when they require this alone.
if (require.main === module) {
    const total = Object.entries(SUBJECT_COURSES).map(([id, c]) => {
        const lessons = (c.chapters || []).reduce((n, ch) => n + ch.steps.reduce((m, s) => m + s.lessons.length, 0), 0);
        return `${id}: ${(c.chapters || []).length} chapters, ${lessons} lessons`;
    });
    console.log(total.join("\n"));
}