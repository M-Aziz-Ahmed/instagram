const SIZE = 10;

function shipsRemaining(board) {
    let count = 0;
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
            if (board.grid[r][c] === "S") count++;
    return count;
}

function applyShot(board, r, c) {
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return { error: "Invalid" };
    if (board.shots[r][c] !== null) return { error: "Already fired" };
    const hit = board.grid[r][c] === "S";
    board.shots[r][c] = hit ? "H" : "M";
    if (hit) board.grid[r][c] = "X";
    return { hit, sunk: shipsRemaining(board) === 0 };
}

function gameOver(boards, targetKey) {
    return shipsRemaining(boards[targetKey]) === 0;
}

function allShots(board) {
    const shots = [];
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
            if (board.shots[r][c] === null) shots.push([r, c]);
    return shots;
}

module.exports = { SIZE, shipsRemaining, applyShot, gameOver, allShots };
