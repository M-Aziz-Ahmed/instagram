const MAX_WRONG = 6;

function masked(word, guessed) {
    return word.split("").map((ch) => (guessed.includes(ch) ? ch : "_")).join(" ");
}

function isWon(word, guessed) {
    return word.split("").every((ch) => guessed.includes(ch));
}

function applyGuess(word, guessed, letter) {
    const l = letter.toUpperCase();
    if (!/^[A-Z]$/.test(l)) return { error: "Invalid letter" };
    if (guessed.includes(l)) return { error: "Already guessed" };
    const correct = word.includes(l);
    return {
        letter: l,
        correct,
        guessed: [...guessed, l],
        won: isWon(word, [...guessed, l]),
    };
}

module.exports = { MAX_WRONG, masked, isWon, applyGuess };
