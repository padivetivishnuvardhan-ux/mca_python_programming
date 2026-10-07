import random
from copy import deepcopy

ROWS = 8
COLS = 8
TILES = 6

class Match3Game:
    def __init__(self, difficulty=0.5, seed=None):
        self.random = random.Random(seed)
        self.difficulty = max(0.0, min(1.0, float(difficulty)))
        self.moves_limit = int(round(35 - 12 * self.difficulty))
        self.target_score = int(round(700 + 700 * self.difficulty))
        self.board = self._new_board()
        self.score = 0
        self.moves = 0
        self.hints_used = 0

    def _new_board(self):
        board = [[0] * COLS for _ in range(ROWS)]
        for r in range(ROWS):
            for c in range(COLS):
                choices = list(range(TILES))
                if c >= 2 and board[r][c-1] == board[r][c-2]:
                    if board[r][c-1] in choices: choices.remove(board[r][c-1])
                if r >= 2 and board[r-1][c] == board[r-2][c]:
                    if board[r-1][c] in choices: choices.remove(board[r-1][c])
                board[r][c] = self.random.choice(choices)
        return board

    def find_matches(self, board=None):
        b = board or self.board
        matched = set()
        for r in range(ROWS):
            start = 0
            for c in range(1, COLS + 1):
                if c == COLS or b[r][c] != b[r][start]:
                    if c - start >= 3:
                        matched.update((r, x) for x in range(start, c))
                    start = c
        for c in range(COLS):
            start = 0
            for r in range(1, ROWS + 1):
                if r == ROWS or b[r][c] != b[start][c]:
                    if r - start >= 3:
                        matched.update((x, c) for x in range(start, r))
                    start = r
        return matched

    def legal_moves(self):
        moves = []
        for r in range(ROWS):
            for c in range(COLS):
                for dr, dc in ((0,1),(1,0)):
                    nr, nc = r + dr, c + dc
                    if nr >= ROWS or nc >= COLS: continue
                    test = deepcopy(self.board)
                    test[r][c], test[nr][nc] = test[nr][nc], test[r][c]
                    if self.find_matches(test):
                        moves.append(((r,c),(nr,nc)))
        return moves

    def simulate_move(self, move):
        test = deepcopy(self.board)
        (r1,c1),(r2,c2) = move
        test[r1][c1], test[r2][c2] = test[r2][c2], test[r1][c1]
        return len(self.find_matches(test))

    def best_move(self):
        moves = self.legal_moves()
        if not moves: return None
        return max(moves, key=self.simulate_move)

    def best_move_ranked(self, limit=3):
        """Return top-N candidate moves ranked by immediate match size, for the AI hint dashboard."""
        moves = self.legal_moves()
        ranked = sorted(
            ({'move': m, 'match_size': self.simulate_move(m)} for m in moves),
            key=lambda x: x['match_size'],
            reverse=True
        )
        return ranked[:limit]

    def swap(self, move):
        if self.moves >= self.moves_limit:
            return {'valid': False, 'reason': 'No moves left'}
        (r1,c1),(r2,c2) = move
        if abs(r1-r2) + abs(c1-c2) != 1:
            return {'valid': False, 'reason': 'Tiles must be adjacent'}
        self.board[r1][c1], self.board[r2][c2] = self.board[r2][c2], self.board[r1][c1]
        matched = self.find_matches()
        if not matched:
            self.board[r1][c1], self.board[r2][c2] = self.board[r2][c2], self.board[r1][c1]
            return {'valid': False, 'reason': 'Swap does not create a match'}
        self.moves += 1
        gained, cascades = self._resolve()
        return {
            'valid': True,
            'score_gained': gained,
            'score': self.score,
            'moves': self.moves,
            'cascades': cascades
        }

    def _resolve(self):
        """Resolve matches in cascades, recording a snapshot after each step so
        the frontend can animate popping (matched tiles) then sliding (refill)."""
        total = 0
        cascade = 1
        steps = []
        while True:
            matched = self.find_matches()
            if not matched:
                break
            gained = len(matched) * 10 * cascade
            total += gained
            self.score += gained
            matched_list = [[r, c] for r, c in matched]
            for r, c in matched:
                self.board[r][c] = -1
            for c in range(COLS):
                vals = [self.board[r][c] for r in range(ROWS) if self.board[r][c] != -1]
                new_count = ROWS - len(vals)
                for r in range(ROWS - 1, -1, -1):
                    self.board[r][c] = vals.pop() if vals else self.random.randrange(TILES)
            steps.append({
                'cascade': cascade,
                'matched': matched_list,
                'gained': gained,
                'board_after': deepcopy(self.board)
            })
            cascade += 1
        return total, steps

    def state(self):
        return {
            'board': self.board,
            'score': self.score,
            'moves': self.moves,
            'moves_limit': self.moves_limit,
            'target_score': self.target_score,
            'difficulty': round(self.difficulty, 2)
        }
