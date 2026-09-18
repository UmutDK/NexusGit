# Backend Python — guide d'implémentation complet

À lire après `01-presentation-application.md` (qui liste le contrat API complet — ce
document explique **comment le construire**, en Python, sans framework). Objectif :
remplacer entièrement le mock [`dev/mock-api.js`](../../dev/mock-api.js) par un vrai
serveur avec une vraie base de données, une vraie authentification, et les bonnes
règles de permissions.

## 1. Stack recommandée

- **Python 3.11+**, aucune dépendance externe obligatoire.
- **Serveur HTTP** : module standard `http.server` avec un routeur "fait main"
  (même esprit que le mock Node actuel, qui route à la main sur `req.url` /
  `req.method`). Pas besoin de Flask/FastAPI/Django — mais si l'équipe change d'avis
  plus tard, tout ce qui suit (schéma, logique métier) reste valable, seule la couche
  de routing changerait.
- **Base de données** : `sqlite3` (module standard, zéro configuration, un simple
  fichier `.db`). Si vous préférez MySQL/Postgres en prod, il suffit de changer la
  couche `db.py` — toutes les requêtes SQL ci-dessous sont volontairement simples
  (pas de syntaxe spécifique à SQLite) pour rester portables.
- **Mots de passe** : `hashlib.pbkdf2_hmac` (dans la lib standard, pas besoin de
  `bcrypt` externe) + un sel aléatoire par utilisateur.
- **Tokens d'authentification** : un token opaque aléatoire stocké en base (table
  `auth_tokens`), plus simple à faire sans dépendance qu'un vrai JWT signé. Chaque
  requête protégée fait un `SELECT` sur ce token pour retrouver l'utilisateur.
- **JSON / UUID** : modules standards `json` et `uuid`.

## 2. Structure de fichiers proposée

```
backend/
  server.py                    # point d'entrée : démarre le serveur, dispatch des routes
  db.py                        # connexion SQLite + création des tables au démarrage
  schema.sql                   # tout le schéma (section 3)
  auth.py                      # hachage mot de passe, génération/vérification de token
  helpers.py                   # petits utilitaires partagés (JSON, erreurs, permissions)
  routes/
    auth_routes.py
    team_routes.py
    board_routes.py
    status_routes.py
    task_routes.py
    comment_routes.py
    label_routes.py
    notification_routes.py
    time_tracking_routes.py
```

## 3. Schéma de base de données complet

```sql
CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE auth_tokens (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE teams (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    due_soon_days  INTEGER NOT NULL DEFAULT 7,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

CREATE TABLE team_members (
    team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role      TEXT NOT NULL CHECK (role IN ('coordinator', 'member')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (team_id, user_id)
);

CREATE TABLE invitations (
    id         TEXT PRIMARY KEY,
    team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email      TEXT NOT NULL,
    token      TEXT NOT NULL UNIQUE,           -- utilisé dans l'URL /invitations/{token}
    invited_by TEXT NOT NULL REFERENCES users(id),
    status     TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE boards (
    id         TEXT PRIMARY KEY,
    team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE statuses (
    id          TEXT PRIMARY KEY,
    board_id    TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#94a3b8',
    position    REAL NOT NULL,
    is_terminal INTEGER NOT NULL DEFAULT 0,     -- 0/1 (SQLite n'a pas de booléen natif)
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE tasks (
    id           TEXT PRIMARY KEY,
    board_id     TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    status_id    TEXT NOT NULL REFERENCES statuses(id),
    title        TEXT NOT NULL,
    description  TEXT,
    priority     TEXT NOT NULL CHECK (priority IN ('faible', 'moyenne', 'haute', 'critique')),
    due_date     TEXT,
    position     REAL NOT NULL,
    created_by   TEXT NOT NULL REFERENCES users(id),
    completed_at TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE TABLE task_assignees (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
);

CREATE TABLE labels (
    id      TEXT PRIMARY KEY,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name    TEXT NOT NULL,
    color   TEXT NOT NULL DEFAULT '#94a3b8',
    UNIQUE (team_id, name)
);

CREATE TABLE task_labels (
    task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

CREATE TABLE comments (
    id         TEXT PRIMARY KEY,
    task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id  TEXT NOT NULL REFERENCES users(id),
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE activity_log (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id),
    action_type TEXT NOT NULL,
    metadata    TEXT NOT NULL DEFAULT '{}',      -- JSON sérialisé en texte
    created_at  TEXT NOT NULL
);

CREATE TABLE notifications (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,
    task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    triggered_by_id TEXT REFERENCES users(id),
    message         TEXT NOT NULL,
    is_read         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL
);

CREATE TABLE time_entries (
    id               TEXT PRIMARY KEY,
    task_id          TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    team_id          TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at       TEXT NOT NULL,
    ended_at         TEXT,
    duration_seconds INTEGER,
    created_at       TEXT NOT NULL
);

CREATE INDEX idx_time_entries_active ON time_entries (user_id, ended_at);
CREATE INDEX idx_time_entries_team   ON time_entries (team_id, started_at);
CREATE INDEX idx_tasks_board         ON tasks (board_id);
CREATE INDEX idx_statuses_board      ON statuses (board_id);
```

## 4. Connexion DB (`db.py`)

```python
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "nexus.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    schema = (Path(__file__).parent / "schema.sql").read_text()
    conn.executescript(schema)
    conn.commit()
    conn.close()
```

## 5. Authentification (`auth.py`)

```python
import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

TOKEN_TTL = timedelta(days=30)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000)
    return digest.hex(), salt


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    digest, _ = hash_password(password, salt)
    return secrets.compare_digest(digest, stored_hash)


def create_token(db, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + TOKEN_TTL).isoformat()
    db.execute(
        "INSERT INTO auth_tokens (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, now_iso(), expires_at),
    )
    db.commit()
    return token


def get_user_from_token(db, token: str) -> sqlite3.Row | None:
    row = db.execute(
        """
        SELECT users.* FROM auth_tokens
        JOIN users ON users.id = auth_tokens.user_id
        WHERE auth_tokens.token = ? AND auth_tokens.expires_at > ?
        """,
        (token, now_iso()),
    ).fetchone()
    return row


def new_id() -> str:
    return str(uuid.uuid4())
```

Routes d'auth (`routes/auth_routes.py`) :

```python
from auth import create_token, hash_password, new_id, now_iso, verify_password
from helpers import BadRequest, Unauthorized, serialize_user


def register(db, body):
    if not body.get("name") or not body.get("email") or not body.get("password"):
        raise BadRequest("name, email and password are required")

    existing = db.execute("SELECT id FROM users WHERE email = ?", (body["email"],)).fetchone()
    if existing:
        raise BadRequest("Email already registered")

    password_hash, salt = hash_password(body["password"])
    user_id = new_id()
    db.execute(
        "INSERT INTO users (id, name, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, body["name"], body["email"], password_hash, salt, now_iso()),
    )
    db.commit()

    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    token = create_token(db, user_id)
    return {"accessToken": token, "user": serialize_user(user)}


def login(db, body):
    user = db.execute("SELECT * FROM users WHERE email = ?", (body.get("email"),)).fetchone()
    if not user or not verify_password(body.get("password", ""), user["password_hash"], user["password_salt"]):
        raise Unauthorized("Invalid credentials")

    token = create_token(db, user["id"])
    return {"accessToken": token, "user": serialize_user(user)}


def me(db, current_user):
    return serialize_user(current_user)
```

## 6. Utilitaires partagés (`helpers.py`)

```python
import json


class ApiError(Exception):
    status_code = 400

    def __init__(self, message):
        super().__init__(message)
        self.message = message


class BadRequest(ApiError):
    status_code = 400


class Unauthorized(ApiError):
    status_code = 401


class Forbidden(ApiError):
    status_code = 403


class NotFound(ApiError):
    status_code = 404


class Conflict(ApiError):
    status_code = 409


def serialize_user(row):
    return {"id": row["id"], "name": row["name"], "email": row["email"], "createdAt": row["created_at"]}


def get_team_role(db, user_id: str, team_id: str) -> str | None:
    row = db.execute(
        "SELECT role FROM team_members WHERE team_id = ? AND user_id = ?", (team_id, user_id)
    ).fetchone()
    return row["role"] if row else None


def require_team_member(db, user_id: str, team_id: str) -> str:
    role = get_team_role(db, user_id, team_id)
    if role is None:
        raise Forbidden("Not a member of this team")
    return role


def require_coordinator(db, user_id: str, team_id: str) -> None:
    if require_team_member(db, user_id, team_id) != "coordinator":
        raise Forbidden("Coordinator role required")


def get_team_id_for_board(db, board_id: str) -> str | None:
    row = db.execute("SELECT team_id FROM boards WHERE id = ?", (board_id,)).fetchone()
    return row["team_id"] if row else None


def get_board_id_for_task(db, task_id: str) -> str | None:
    row = db.execute("SELECT board_id FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return row["board_id"] if row else None


def get_team_id_for_task(db, task_id: str) -> str | None:
    row = db.execute(
        "SELECT boards.team_id FROM tasks JOIN boards ON boards.id = tasks.board_id WHERE tasks.id = ?",
        (task_id,),
    ).fetchone()
    return row["team_id"] if row else None


def log_activity(db, task_id, user_id, action_type, metadata=None):
    import uuid
    from auth import now_iso

    db.execute(
        "INSERT INTO activity_log (id, task_id, user_id, action_type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), task_id, user_id, action_type, json.dumps(metadata or {}), now_iso()),
    )
```

**Règles de permission à respecter** (déduites de ce que l'UI Angular cache déjà aux
`member` — à appliquer aussi côté serveur, ne jamais se fier uniquement au frontend) :

| Action | Qui peut le faire |
|---|---|
| Renommer/supprimer une équipe, changer `dueSoonDays` | `coordinator` |
| Inviter/retirer un membre, changer un rôle | `coordinator` |
| Créer/renommer/supprimer un tableau | `coordinator` |
| Créer/modifier/supprimer/réordonner une colonne (statut) | `coordinator` |
| Envoyer un rappel (`/tasks/{id}/remind`) | `coordinator` |
| Créer/modifier une tâche, commenter, s'auto-assigner | tout membre de l'équipe |
| Voir les données de l'équipe (GET) | tout membre de l'équipe |

## 7. Serveur & routage (`server.py`)

```python
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from db import get_connection, init_db
from auth import get_user_from_token
from helpers import ApiError, Unauthorized

from routes import auth_routes, team_routes, board_routes, status_routes
from routes import task_routes, comment_routes, label_routes, notification_routes
from routes import time_tracking_routes

PUBLIC_ROUTES = {("POST", "/auth/register"), ("POST", "/auth/login")}


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send_json({})

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def _dispatch(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        segments = [s for s in path.split("/") if s]
        db = get_connection()

        try:
            current_user = None
            if (method, path) not in PUBLIC_ROUTES:
                auth_header = self.headers.get("Authorization", "")
                token = auth_header.removeprefix("Bearer ").strip()
                current_user = get_user_from_token(db, token) if token else None
                if current_user is None:
                    raise Unauthorized("Missing or invalid token")

            body = self._read_body() if method in ("POST", "PATCH", "PUT") else None
            result = route(db, method, segments, body, query, current_user)
            self._send_json(result if result is not None else {})
        except ApiError as e:
            self._send_json({"error": e.message}, status=e.status_code)
        except Exception as e:  # garde-fou : ne jamais laisser fuiter une stack trace
            self._send_json({"error": "Internal server error"}, status=500)
            raise
        finally:
            db.close()

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_PATCH(self):
        self._dispatch("PATCH")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_DELETE(self):
        self._dispatch("DELETE")


def route(db, method, seg, body, query, user):
    # /auth/*
    if seg[:1] == ["auth"]:
        if seg == ["auth", "register"]:
            return auth_routes.register(db, body)
        if seg == ["auth", "login"]:
            return auth_routes.login(db, body)
        if seg == ["auth", "me"]:
            return auth_routes.me(db, user)

    # /teams...
    if seg[:1] == ["teams"]:
        return team_routes.route(db, method, seg, body, query, user)

    # /boards...
    if seg[:1] == ["boards"]:
        return board_routes.route(db, method, seg, body, query, user)

    # /statuses/{id}
    if seg[:1] == ["statuses"]:
        return status_routes.route(db, method, seg, body, user)

    # /tasks...
    if seg[:1] == ["tasks"]:
        return task_routes.route(db, method, seg, body, user)

    # /comments/{id}
    if seg[:1] == ["comments"]:
        return comment_routes.route(db, method, seg, body, user)

    # /labels/{id}
    if seg[:1] == ["labels"]:
        return label_routes.route(db, method, seg, body, user)

    # /notifications...
    if seg[:1] == ["notifications"]:
        return notification_routes.route(db, method, seg, query, user)

    # /invitations/{token}/accept
    if seg[:1] == ["invitations"]:
        return team_routes.accept_invitation(db, seg[1], user)

    from helpers import NotFound
    raise NotFound("Route not found")


if __name__ == "__main__":
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", 4010), Handler)
    print("Backend Python en écoute sur http://localhost:4010")
    server.serve_forever()
```

Ce routeur imite volontairement la structure du mock Node (`req.url` découpé en
segments, `if` en cascade) pour rester lisible sans framework. Chaque module
`routes/*.py` expose une fonction `route(...)` qui gère ses propres sous-chemins —
inspire-toi du détail ci-dessous pour les autres modules.

## 8. Équipes (`routes/team_routes.py`)

```python
from auth import new_id, now_iso
from helpers import (
    BadRequest, Conflict, Forbidden, NotFound,
    get_team_role, require_coordinator, require_team_member, serialize_user,
)


def serialize_team(db, row, user_id):
    role = get_team_role(db, user_id, row["id"])
    count = db.execute(
        "SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?", (row["id"],)
    ).fetchone()["n"]
    return {
        "id": row["id"], "name": row["name"], "dueSoonDays": row["due_soon_days"],
        "memberCount": count, "myRole": role,
        "createdAt": row["created_at"], "updatedAt": row["updated_at"],
    }


def serialize_member(row):
    return {
        "user": {"id": row["id"], "name": row["name"], "email": row["email"], "createdAt": row["user_created_at"]},
        "role": row["role"], "joinedAt": row["joined_at"],
    }


def list_teams(db, user):
    rows = db.execute(
        """
        SELECT teams.* FROM teams
        JOIN team_members ON team_members.team_id = teams.id
        WHERE team_members.user_id = ?
        """,
        (user["id"],),
    ).fetchall()
    return [serialize_team(db, r, user["id"]) for r in rows]


def create_team(db, body, user):
    if not body.get("name"):
        raise BadRequest("name is required")
    team_id = new_id()
    now = now_iso()
    db.execute(
        "INSERT INTO teams (id, name, due_soon_days, created_at, updated_at) VALUES (?, ?, 7, ?, ?)",
        (team_id, body["name"], now, now),
    )
    db.execute(
        "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'coordinator', ?)",
        (team_id, user["id"], now),
    )
    db.commit()
    team = db.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone()
    return serialize_team(db, team, user["id"])


def get_team(db, team_id, user):
    require_team_member(db, user["id"], team_id)
    team = db.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone()
    if not team:
        raise NotFound("Team not found")
    return serialize_team(db, team, user["id"])


def update_team(db, team_id, body, user):
    require_coordinator(db, user["id"], team_id)
    fields, params = [], []
    for key, column in (("name", "name"), ("dueSoonDays", "due_soon_days")):
        if key in body:
            fields.append(f"{column} = ?")
            params.append(body[key])
    if fields:
        params += [now_iso(), team_id]
        db.execute(f"UPDATE teams SET {', '.join(fields)}, updated_at = ? WHERE id = ?", params)
        db.commit()
    team = db.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone()
    return serialize_team(db, team, user["id"])


def delete_team(db, team_id, user):
    require_coordinator(db, user["id"], team_id)
    db.execute("DELETE FROM teams WHERE id = ?", (team_id,))  # cascade via FOREIGN KEY
    db.commit()


def list_members(db, team_id, user):
    require_team_member(db, user["id"], team_id)
    rows = db.execute(
        """
        SELECT users.id, users.name, users.email, users.created_at AS user_created_at,
               team_members.role, team_members.joined_at
        FROM team_members JOIN users ON users.id = team_members.user_id
        WHERE team_members.team_id = ?
        """,
        (team_id,),
    ).fetchall()
    return [serialize_member(r) for r in rows]


def update_member_role(db, team_id, target_user_id, body, user):
    require_coordinator(db, user["id"], team_id)
    db.execute(
        "UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?",
        (body["role"], team_id, target_user_id),
    )
    db.commit()
    row = db.execute(
        """
        SELECT users.id, users.name, users.email, users.created_at AS user_created_at,
               team_members.role, team_members.joined_at
        FROM team_members JOIN users ON users.id = team_members.user_id
        WHERE team_id = ? AND user_id = ?
        """,
        (team_id, target_user_id),
    ).fetchone()
    return serialize_member(row)


def remove_member(db, team_id, target_user_id, user):
    require_coordinator(db, user["id"], team_id)
    db.execute("DELETE FROM team_members WHERE team_id = ? AND user_id = ?", (team_id, target_user_id))
    db.commit()


def build_dashboard(db, team_id, user):
    require_team_member(db, user["id"], team_id)

    total = db.execute(
        "SELECT COUNT(*) n FROM tasks JOIN boards ON boards.id = tasks.board_id WHERE boards.team_id = ?",
        (team_id,),
    ).fetchone()["n"]

    completed = db.execute(
        """
        SELECT COUNT(*) n FROM tasks
        JOIN boards ON boards.id = tasks.board_id
        JOIN statuses ON statuses.id = tasks.status_id
        WHERE boards.team_id = ? AND statuses.is_terminal = 1
        """,
        (team_id,),
    ).fetchone()["n"]

    # "à démarrer" = tâches dans la 1ère colonne non terminale de leur tableau
    to_start = db.execute(
        """
        SELECT COUNT(*) n FROM tasks t
        JOIN statuses s ON s.id = t.status_id
        JOIN boards b ON b.id = t.board_id
        WHERE b.team_id = ? AND s.position = (
            SELECT MIN(s2.position) FROM statuses s2 WHERE s2.board_id = s.board_id AND s2.is_terminal = 0
        )
        """,
        (team_id,),
    ).fetchone()["n"]

    members = list_members(db, team_id, user)

    from task_routes import serialize_task  # import tardif pour éviter les imports circulaires
    recent_rows = db.execute(
        """
        SELECT tasks.* FROM tasks JOIN boards ON boards.id = tasks.board_id
        WHERE boards.team_id = ? ORDER BY tasks.created_at DESC LIMIT 3
        """,
        (team_id,),
    ).fetchall()

    return {
        "totalTasks": total,
        "inProgress": max(total - completed - to_start, 0),
        "completed": completed,
        "toStart": to_start,
        "teamMembers": members,
        "recentTasks": [serialize_task(db, r) for r in recent_rows],
    }


def create_invitation(db, team_id, body, user):
    require_coordinator(db, user["id"], team_id)
    from datetime import datetime, timedelta, timezone
    import secrets

    invitation_id, token = new_id(), secrets.token_urlsafe(24)
    now = now_iso()
    expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    db.execute(
        """
        INSERT INTO invitations (id, team_id, email, token, invited_by, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
        """,
        (invitation_id, team_id, body["email"], token, user["id"], now, expires),
    )
    db.commit()
    # TODO: envoyer un email avec le lien http://<frontend>/invitations/{token}
    row = db.execute("SELECT * FROM invitations WHERE id = ?", (invitation_id,)).fetchone()
    return serialize_invitation(db, row)


def serialize_invitation(db, row):
    inviter = db.execute("SELECT * FROM users WHERE id = ?", (row["invited_by"],)).fetchone()
    return {
        "id": row["id"], "email": row["email"], "invitedBy": serialize_user(inviter),
        "status": row["status"], "createdAt": row["created_at"], "expiresAt": row["expires_at"],
    }


def list_invitations(db, team_id, user):
    require_coordinator(db, user["id"], team_id)
    rows = db.execute("SELECT * FROM invitations WHERE team_id = ?", (team_id,)).fetchall()
    return [serialize_invitation(db, r) for r in rows]


def revoke_invitation(db, team_id, invitation_id, user):
    require_coordinator(db, user["id"], team_id)
    db.execute("UPDATE invitations SET status = 'revoked' WHERE id = ? AND team_id = ?", (invitation_id, team_id))
    db.commit()
    row = db.execute("SELECT * FROM invitations WHERE id = ?", (invitation_id,)).fetchone()
    return serialize_invitation(db, row)


def accept_invitation(db, token, user):
    invitation = db.execute("SELECT * FROM invitations WHERE token = ?", (token,)).fetchone()
    if not invitation or invitation["status"] != "pending":
        raise NotFound("Invitation not found or no longer valid")

    db.execute("UPDATE invitations SET status = 'accepted' WHERE id = ?", (invitation["id"],))
    existing = db.execute(
        "SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?", (invitation["team_id"], user["id"])
    ).fetchone()
    if not existing:
        db.execute(
            "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
            (invitation["team_id"], user["id"], now_iso()),
        )
    db.commit()
    team = db.execute("SELECT * FROM teams WHERE id = ?", (invitation["team_id"],)).fetchone()
    return serialize_team(db, team, user["id"])


def route(db, method, seg, body, query, user):
    # /teams
    if len(seg) == 1:
        if method == "POST":
            return create_team(db, body, user)
        return list_teams(db, user)

    team_id = seg[1]

    # /teams/{id}
    if len(seg) == 2:
        if method == "PATCH":
            return update_team(db, team_id, body, user)
        if method == "DELETE":
            return delete_team(db, team_id, user)
        return get_team(db, team_id, user)

    sub = seg[2]

    if sub == "dashboard":
        return build_dashboard(db, team_id, user)

    if sub == "members":
        if len(seg) == 3:
            return list_members(db, team_id, user)
        target_user_id = seg[3]
        if method == "PATCH":
            return update_member_role(db, team_id, target_user_id, body, user)
        if method == "DELETE":
            return remove_member(db, team_id, target_user_id, user)

    if sub == "invitations":
        if len(seg) == 3:
            if method == "POST":
                return create_invitation(db, team_id, body, user)
            return list_invitations(db, team_id, user)
        if len(seg) == 4 and method == "PATCH":
            return revoke_invitation(db, team_id, seg[3], user)

    if sub == "boards":
        from routes.board_routes import list_for_team, create_for_team
        if method == "POST":
            return create_for_team(db, team_id, body, user)
        return list_for_team(db, team_id, user)

    if sub == "labels":
        from routes.label_routes import list_for_team, create_for_team
        if method == "POST":
            return create_for_team(db, team_id, body, user)
        return list_for_team(db, team_id, user)

    from helpers import NotFound
    raise NotFound("Route not found")
```

## 9. Tableaux, statuts, tâches, commentaires, étiquettes, notifications

Ces modules suivent **exactement le même schéma** que `team_routes.py` :
1. une fonction `serialize_xxx(row)` qui transforme une ligne SQL en dict JSON avec
   les clés `camelCase` attendues par le frontend,
2. une fonction par action (list/get/create/update/delete),
3. un contrôle de permission systématique via `require_team_member`/
   `require_coordinator` en résolvant l'équipe concernée (`get_team_id_for_board`,
   `get_team_id_for_task`),
4. une fonction `route(...)` qui dispatch les sous-chemins.

Le contrat exact de chaque route (méthode, chemin, body, réponse) est dans
`01-presentation-application.md`, section 5 — utilise-le comme check-list. Points
spécifiques à ne pas oublier :

- **`PATCH /tasks/{id}` sert aussi au drag & drop** : accepte `{ statusId, position }`
  où `position` est un `REAL` (flottant), pas un entier — le frontend envoie la
  moyenne entre les deux tâches voisines pour insérer sans tout renuméroter.
- **`PUT /tasks/{id}/assignees`** et **`PUT /tasks/{id}/labels`** *remplacent*
  entièrement la liste (pas un ajout) : `DELETE` puis ré-`INSERT` dans la table de
  jointure (`task_assignees`/`task_labels`) à partir de `userIds`/`labelIds`.
- **Historique d'activité** : appelle `log_activity(db, task_id, user_id,
  action_type, metadata)` (section 6) à chaque `PATCH /tasks/{id}` qui change
  `statusId`/`priority`, à chaque (dés)assignation, ajout/retrait d'étiquette, et à
  la création d'un commentaire. C'est ce flux qui alimente
  `GET /tasks/{id}/activity`.
- **Notifications à générer côté serveur** (pas par le frontend) :
  - `assigned` quand un utilisateur est ajouté à `assignees`,
  - `comment_added` pour les autres assignés quand quelqu'un commente,
  - `due_date_soon` : à calculer soit à la volée dans un job planifié (ex. tâche
    cron qui tourne chaque nuit et compare `due_date` à `due_soon_days` de
    l'équipe), soit paresseusement à la connexion — à voir avec l'équipe frontend
    selon la volumétrie attendue.
  - `manual_reminder` est déjà couvert par `POST /tasks/{id}/remind` (créé
    directement dans le handler, pas de logique différée).
- **Étiquettes** : `UNIQUE (team_id, name)` en base fait le gros du travail —
  intercepte l'erreur d'intégrité SQLite et renvoie `409 { "error": "..." }` comme
  le fait le mock.

## 10. Suivi du temps (chrono) — `routes/time_tracking_routes.py`

Nouvelle fonctionnalité, absente du mock actuel. Rappel des règles :

- **Un seul chrono actif par utilisateur à la fois**, tous tableaux confondus : en
  démarrer un nouveau clôture automatiquement l'ancien.
- Les autres membres de l'équipe voient qui a un chrono actif via un endpoint que le
  frontend **poll** toutes les 5-10 secondes (pas de WebSocket nécessaire).

```python
from auth import new_id, now_iso
from helpers import BadRequest, Conflict, NotFound, get_team_id_for_task, require_team_member


def serialize_entry(row):
    return {
        "id": row["id"], "taskId": row["task_id"], "taskTitle": row["task_title"],
        "teamId": row["team_id"], "userId": row["user_id"], "userName": row["user_name"],
        "startedAt": row["started_at"], "endedAt": row["ended_at"],
        "durationSeconds": row["duration_seconds"],
    }


def _with_joins(db, entry_id):
    return db.execute(
        """
        SELECT te.*, tasks.title AS task_title, users.name AS user_name
        FROM time_entries te
        JOIN tasks ON tasks.id = te.task_id
        JOIN users ON users.id = te.user_id
        WHERE te.id = ?
        """,
        (entry_id,),
    ).fetchone()


def start_timer(db, task_id, user):
    team_id = get_team_id_for_task(db, task_id)
    if team_id is None:
        raise NotFound("Task not found")
    require_team_member(db, user["id"], team_id)

    now = now_iso()
    active = db.execute(
        "SELECT * FROM time_entries WHERE user_id = ? AND ended_at IS NULL", (user["id"],)
    ).fetchone()
    if active:
        from datetime import datetime
        duration = int((datetime.fromisoformat(now) - datetime.fromisoformat(active["started_at"])).total_seconds())
        db.execute(
            "UPDATE time_entries SET ended_at = ?, duration_seconds = ? WHERE id = ?",
            (now, duration, active["id"]),
        )

    entry_id = new_id()
    db.execute(
        """
        INSERT INTO time_entries (id, task_id, team_id, user_id, started_at, ended_at, duration_seconds, created_at)
        VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)
        """,
        (entry_id, task_id, team_id, user["id"], now, now),
    )
    db.commit()
    return serialize_entry(_with_joins(db, entry_id))


def stop_timer(db, task_id, user):
    active = db.execute(
        "SELECT * FROM time_entries WHERE user_id = ? AND task_id = ? AND ended_at IS NULL",
        (user["id"], task_id),
    ).fetchone()
    if not active:
        raise Conflict("No active timer for this task")

    from datetime import datetime
    now = now_iso()
    duration = int((datetime.fromisoformat(now) - datetime.fromisoformat(active["started_at"])).total_seconds())
    db.execute(
        "UPDATE time_entries SET ended_at = ?, duration_seconds = ? WHERE id = ?",
        (now, duration, active["id"]),
    )
    db.commit()
    return serialize_entry(_with_joins(db, active["id"]))


def add_manual_entry(db, task_id, body, user):
    """Saisie a posteriori (bouton "Ajouter une session passée" du frontend) :
    l'entrée est créée déjà terminée, elle ne touche jamais à la règle du chrono
    actif — start_timer/stop_timer restent les seuls à la gérer."""
    team_id = get_team_id_for_task(db, task_id)
    if team_id is None:
        raise NotFound("Task not found")
    require_team_member(db, user["id"], team_id)

    from datetime import datetime
    try:
        started_at = datetime.fromisoformat(body["startedAt"].replace("Z", "+00:00"))
        ended_at = datetime.fromisoformat(body["endedAt"].replace("Z", "+00:00"))
    except (KeyError, ValueError):
        raise BadRequest("startedAt and endedAt must be valid ISO dates")
    if ended_at <= started_at:
        raise BadRequest("endedAt must be after startedAt")

    entry_id = new_id()
    duration = int((ended_at - started_at).total_seconds())
    db.execute(
        """
        INSERT INTO time_entries (id, task_id, team_id, user_id, started_at, ended_at, duration_seconds, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (entry_id, task_id, team_id, user["id"], body["startedAt"], body["endedAt"], duration, now_iso()),
    )
    db.commit()
    return serialize_entry(_with_joins(db, entry_id))


def list_active(db, team_id, user):
    require_team_member(db, user["id"], team_id)
    rows = db.execute(
        """
        SELECT te.*, tasks.title AS task_title, users.name AS user_name
        FROM time_entries te
        JOIN tasks ON tasks.id = te.task_id
        JOIN users ON users.id = te.user_id
        WHERE te.team_id = ? AND te.ended_at IS NULL
        """,
        (team_id,),
    ).fetchall()
    return [serialize_entry(r) for r in rows]


def list_entries(db, team_id, query, user):
    require_team_member(db, user["id"], team_id)
    sql = """
        SELECT te.*, tasks.title AS task_title, users.name AS user_name
        FROM time_entries te
        JOIN tasks ON tasks.id = te.task_id
        JOIN users ON users.id = te.user_id
        WHERE te.team_id = ?
    """
    params = [team_id]
    if query.get("userId"):
        sql += " AND te.user_id = ?"
        params.append(query["userId"])
    if query.get("taskId"):
        sql += " AND te.task_id = ?"
        params.append(query["taskId"])
    if query.get("from"):
        sql += " AND te.started_at >= ?"
        params.append(query["from"])
    if query.get("to"):
        sql += " AND te.started_at <= ?"
        params.append(query["to"])
    sql += " ORDER BY te.started_at DESC"

    rows = db.execute(sql, params).fetchall()
    return [serialize_entry(r) for r in rows]


def route(db, method, seg, query, user):
    # /tasks/{id}/timer/start|stop est dispatché depuis task_routes.py
    # /teams/{id}/active-timers et /teams/{id}/time-entries depuis team_routes.py
    pass
```

Branche ces fonctions :
- `POST /tasks/{id}/timer/start`, `POST /tasks/{id}/timer/stop` et
  `POST /tasks/{id}/time-entries` (saisie manuelle) → dans `task_routes.route`, aux
  côtés de `remind`/`comments`/`activity`.
- `GET /teams/{id}/active-timers` et `GET /teams/{id}/time-entries` → dans
  `team_routes.route`, aux côtés de `dashboard`/`members`/`boards`.

## 11. Répétition de tâches (rappel tous les X jours) — `routes/recurrence_routes.py` + `cron_recurrence.py`

Nouvelle fonctionnalité, absente du mock actuel. Contrairement à tout ce qui
précède, **le simple CRUD ne suffit pas** : il faut aussi qu'un job tourne tout
seul côté serveur pour déclencher le rappel au bon moment, même quand personne n'a
l'application ouverte.

### Schéma

```sql
CREATE TABLE task_recurrences (
    task_id           TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    interval_count    INTEGER NOT NULL,
    unit              TEXT NOT NULL CHECK (unit IN ('day', 'week', 'month')),
    last_triggered_at TEXT,          -- date (YYYY-MM-DD) de la dernière occurrence notifiée
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
);
```
Une tâche a au plus une règle (`task_id` est la clé primaire) — pas de ligne =
pas de répétition.

### Endpoints CRUD

Le frontend attend ce format JSON pour une règle (`TaskRecurrence`) :
```json
{ "taskId": "tk4", "interval": 2, "unit": "week" }
```

```python
from auth import now_iso
from helpers import NotFoundException, get_team_id_for_task, require_team_member


def serialize_recurrence(row):
    return {"taskId": row["task_id"], "interval": row["interval_count"], "unit": row["unit"]}


def set_recurrence(db, task_id, body, user):
    team_id = get_team_id_for_task(db, task_id)
    if team_id is None:
        raise NotFoundException("Task not found")
    require_team_member(db, user["id"], team_id)

    now = now_iso()
    existing = db.execute("SELECT 1 FROM task_recurrences WHERE task_id = ?", (task_id,)).fetchone()
    if existing:
        db.execute(
            "UPDATE task_recurrences SET interval_count = ?, unit = ?, updated_at = ? WHERE task_id = ?",
            (body["interval"], body["unit"], now, task_id),
        )
    else:
        db.execute(
            """
            INSERT INTO task_recurrences (task_id, interval_count, unit, last_triggered_at, created_at, updated_at)
            VALUES (?, ?, ?, NULL, ?, ?)
            """,
            (task_id, body["interval"], body["unit"], now, now),
        )
    db.commit()

    row = db.execute("SELECT * FROM task_recurrences WHERE task_id = ?", (task_id,)).fetchone()
    return serialize_recurrence(row)


def delete_recurrence(db, task_id, user):
    team_id = get_team_id_for_task(db, task_id)
    if team_id is None:
        raise NotFoundException("Task not found")
    require_team_member(db, user["id"], team_id)
    db.execute("DELETE FROM task_recurrences WHERE task_id = ?", (task_id,))
    db.commit()
```

Branche `PUT /tasks/{id}/recurrence` → `set_recurrence` et
`DELETE /tasks/{id}/recurrence` → `delete_recurrence`, dans `task_routes.route`.

### Le job planifié (`cron_recurrence.py`)

Un script **indépendant du serveur HTTP**, lancé une fois par jour par le
planificateur du système (`cron` sous Linux/macOS, Planificateur de tâches sous
Windows) — pas une boucle qui tourne en continu dans le process Python.

Algorithme : pour chaque règle, on recalcule la prochaine occurrence en partant de
l'échéance de la tâche (ou de sa date de création si pas d'échéance) et en avançant
par pas de `interval_count`/`unit` jusqu'à dépasser `last_triggered_at` (ou
aujourd'hui, à la première exécution) — c'est exactement le même calcul que
`nextOccurrence()` côté frontend (`src/app/shared/utils/recurrence.util.ts`), pour
que la date affichée dans l'UI corresponde à celle qui déclenche vraiment le
rappel. Si cette occurrence tombe aujourd'hui (ou avant, si le job n'a pas tourné
un jour), on notifie et on marque `last_triggered_at` pour ne pas notifier deux
fois la même occurrence.

```python
from datetime import date, datetime, timedelta
import uuid

from db import get_connection
from auth import now_iso


def advance(d: date, interval: int, unit: str) -> date:
    if unit == "day":
        return d + timedelta(days=interval)
    if unit == "week":
        return d + timedelta(weeks=interval)
    # month : approximation simple, suffisante pour un rappel (pas de facturation)
    month = d.month - 1 + interval
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, 28)
    return date(year, month, day)


def next_occurrence(anchor: date, interval: int, unit: str, after: date) -> date:
    next_date = anchor
    while next_date <= after:
        next_date = advance(next_date, interval, unit)
    return next_date


def run():
    db = get_connection()
    today = date.today()

    rules = db.execute(
        """
        SELECT task_recurrences.*, tasks.due_date, tasks.created_at AS task_created_at, tasks.title
        FROM task_recurrences JOIN tasks ON tasks.id = task_recurrences.task_id
        """
    ).fetchall()

    for rule in rules:
        anchor_str = rule["due_date"] or rule["task_created_at"]
        anchor = datetime.fromisoformat(anchor_str).date()
        after = datetime.fromisoformat(rule["last_triggered_at"]).date() if rule["last_triggered_at"] else anchor
        occurrence = next_occurrence(anchor, rule["interval_count"], rule["unit"], after)

        if occurrence <= today:
            assignees = db.execute(
                "SELECT user_id FROM task_assignees WHERE task_id = ?", (rule["task_id"],)
            ).fetchall()
            for a in assignees:
                db.execute(
                    """
                    INSERT INTO notifications (id, user_id, type, task_id, triggered_by_id, message, is_read, created_at)
                    VALUES (?, ?, 'recurrence_due', ?, NULL, ?, 0, ?)
                    """,
                    (
                        str(uuid.uuid4()), a["user_id"], rule["task_id"],
                        f'Rappel récurrent : "{rule["title"]}" revient aujourd\'hui.', now_iso(),
                    ),
                )
            db.execute(
                "UPDATE task_recurrences SET last_triggered_at = ? WHERE task_id = ?",
                (occurrence.isoformat(), rule["task_id"]),
            )

    db.commit()
    db.close()


if __name__ == "__main__":
    run()
```

Planifie-le avec une entrée crontab (exécution tous les jours à 7h) :
```
0 7 * * * cd /chemin/vers/backend && /usr/bin/python3 cron_recurrence.py >> cron.log 2>&1
```

Le type `recurrence_due` est un nouveau `NotificationType` à ajouter côté frontend
(`src/app/core/models/notification.model.ts`) quand vous serez prêts à brancher
cette fonctionnalité — prévenez l'équipe frontend à ce moment-là.

## 12. To-do list, liens, notes — `routes/checklist_routes.py`, `routes/link_routes.py`, `routes/note_routes.py`

Trois petits ajouts au détail d'une tâche. Contrairement au suivi du temps ou à la
répétition, ce sont du CRUD simple : pas de règle métier particulière, pas de job
planifié.

### Schéma

```sql
CREATE TABLE checklist_items (
    id         TEXT PRIMARY KEY,
    task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label      TEXT NOT NULL,
    completed  INTEGER NOT NULL DEFAULT 0,
    position   REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE task_links (
    id         TEXT PRIMARY KEY,
    task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    url        TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE task_notes (
    task_id    TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    text       TEXT NOT NULL DEFAULT '',
    updated_at TEXT
);

CREATE INDEX idx_checklist_items_task ON checklist_items (task_id);
CREATE INDEX idx_task_links_task      ON task_links (task_id);
```

`task_notes` a au plus une ligne par tâche (comme `task_recurrences`) — pas de ligne
= pas encore de note enregistrée, le frontend affiche alors un champ vide.

### To-do list (`routes/checklist_routes.py`)

```python
from auth import new_id, now_iso
from helpers import NotFound, get_team_id_for_task, require_team_member


def serialize_item(row):
    return {
        "id": row["id"], "taskId": row["task_id"], "label": row["label"],
        "completed": bool(row["completed"]), "position": row["position"],
    }


def list_items(db, task_id, user):
    team_id = get_team_id_for_task(db, task_id)
    if team_id is None:
        raise NotFound("Task not found")
    require_team_member(db, user["id"], team_id)
    rows = db.execute(
        "SELECT * FROM checklist_items WHERE task_id = ? ORDER BY position", (task_id,)
    ).fetchall()
    return [serialize_item(r) for r in rows]


def create_item(db, task_id, body, user):
    team_id = get_team_id_for_task(db, task_id)
    if team_id is None:
        raise NotFound("Task not found")
    require_team_member(db, user["id"], team_id)

    last = db.execute(
        "SELECT COALESCE(MAX(position), 0) AS p FROM checklist_items WHERE task_id = ?", (task_id,)
    ).fetchone()["p"]

    item_id = new_id()
    now = now_iso()
    db.execute(
        """
        INSERT INTO checklist_items (id, task_id, label, completed, position, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?, ?)
        """,
        (item_id, task_id, body["label"], last + 1, now, now),
    )
    db.commit()
    return serialize_item(db.execute("SELECT * FROM checklist_items WHERE id = ?", (item_id,)).fetchone())


def update_item(db, item_id, body, user):
    row = db.execute("SELECT * FROM checklist_items WHERE id = ?", (item_id,)).fetchone()
    if not row:
        raise NotFound("Checklist item not found")
    require_team_member(db, user["id"], get_team_id_for_task(db, row["task_id"]))

    fields, params = [], []
    if "label" in body:
        fields.append("label = ?")
        params.append(body["label"])
    if "completed" in body:
        fields.append("completed = ?")
        params.append(1 if body["completed"] else 0)
    if fields:
        params += [now_iso(), item_id]
        db.execute(f"UPDATE checklist_items SET {', '.join(fields)}, updated_at = ? WHERE id = ?", params)
        db.commit()

    return serialize_item(db.execute("SELECT * FROM checklist_items WHERE id = ?", (item_id,)).fetchone())


def delete_item(db, item_id, user):
    row = db.execute("SELECT * FROM checklist_items WHERE id = ?", (item_id,)).fetchone()
    if not row:
        raise NotFound("Checklist item not found")
    require_team_member(db, user["id"], get_team_id_for_task(db, row["task_id"]))
    db.execute("DELETE FROM checklist_items WHERE id = ?", (item_id,))
    db.commit()
```

### Liens (`routes/link_routes.py`)

Reproduis côté serveur la même normalisation d'URL que le frontend
(`src/app/core/services/task-link.service.ts`) : préfixe `https://` si l'URL ne
commence pas par `http`, et utilise l'URL comme libellé si `name` est vide — pour
que le comportement reste identique en cas d'appel direct à l'API.

```python
import re

from auth import new_id, now_iso
from helpers import BadRequest, NotFound, get_team_id_for_task, require_team_member

URL_SCHEME_RE = re.compile(r"^https?://", re.IGNORECASE)


def serialize_link(row):
    return {"id": row["id"], "taskId": row["task_id"], "name": row["name"], "url": row["url"]}


def list_links(db, task_id, user):
    team_id = get_team_id_for_task(db, task_id)
    if team_id is None:
        raise NotFound("Task not found")
    require_team_member(db, user["id"], team_id)
    rows = db.execute("SELECT * FROM task_links WHERE task_id = ? ORDER BY created_at", (task_id,)).fetchall()
    return [serialize_link(r) for r in rows]


def create_link(db, task_id, body, user):
    team_id = get_team_id_for_task(db, task_id)
    if team_id is None:
        raise NotFound("Task not found")
    require_team_member(db, user["id"], team_id)

    url = (body.get("url") or "").strip()
    if not url:
        raise BadRequest("url is required")
    normalized_url = url if URL_SCHEME_RE.match(url) else f"https://{url}"
    name = (body.get("name") or "").strip() or normalized_url

    link_id = new_id()
    db.execute(
        "INSERT INTO task_links (id, task_id, name, url, created_at) VALUES (?, ?, ?, ?, ?)",
        (link_id, task_id, name, normalized_url, now_iso()),
    )
    db.commit()
    return serialize_link(db.execute("SELECT * FROM task_links WHERE id = ?", (link_id,)).fetchone())


def delete_link(db, link_id, user):
    row = db.execute("SELECT * FROM task_links WHERE id = ?", (link_id,)).fetchone()
    if not row:
        raise NotFound("Link not found")
    require_team_member(db, user["id"], get_team_id_for_task(db, row["task_id"]))
    db.execute("DELETE FROM task_links WHERE id = ?", (link_id,))
    db.commit()
```

### Notes (`routes/note_routes.py`)

```python
from helpers import NotFound, get_team_id_for_task, require_team_member


def serialize_note(task_id, row):
    if row is None:
        return {"taskId": task_id, "text": "", "updatedAt": None}
    return {"taskId": row["task_id"], "text": row["text"], "updatedAt": row["updated_at"]}


def get_note(db, task_id, user):
    team_id = get_team_id_for_task(db, task_id)
    if team_id is None:
        raise NotFound("Task not found")
    require_team_member(db, user["id"], team_id)
    row = db.execute("SELECT * FROM task_notes WHERE task_id = ?", (task_id,)).fetchone()
    return serialize_note(task_id, row)


def save_note(db, task_id, body, user):
    from auth import now_iso

    team_id = get_team_id_for_task(db, task_id)
    if team_id is None:
        raise NotFound("Task not found")
    require_team_member(db, user["id"], team_id)

    now = now_iso()
    existing = db.execute("SELECT 1 FROM task_notes WHERE task_id = ?", (task_id,)).fetchone()
    if existing:
        db.execute("UPDATE task_notes SET text = ?, updated_at = ? WHERE task_id = ?", (body["text"], now, task_id))
    else:
        db.execute(
            "INSERT INTO task_notes (task_id, text, updated_at) VALUES (?, ?, ?)", (task_id, body["text"], now)
        )
    db.commit()
    return serialize_note(task_id, db.execute("SELECT * FROM task_notes WHERE task_id = ?", (task_id,)).fetchone())
```

Branche ces fonctions :
- `GET/POST /tasks/{id}/checklist-items`, `GET/POST /tasks/{id}/links` et
  `GET/PUT /tasks/{id}/note` → dans `task_routes.route`.
- `PATCH/DELETE /checklist-items/{id}` et `DELETE /links/{id}` → nouvelles branches
  au niveau racine du routeur (`server.py`, fonction `route()`), au même niveau que
  `/comments/{id}` et `/labels/{id}`.

## 13. CORS

Déjà géré dans `server.py` (`_send_json` ajoute les en-têtes `Access-Control-Allow-*`
sur toute réponse, et `do_OPTIONS` répond `204` à la pré-requête du navigateur) — à
restreindre à l'origine réelle du frontend en production plutôt que `*`.

## 14. Démarrage et tests

```bash
cd backend
python server.py
# dans un autre terminal :
curl -X POST http://localhost:4010/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@nexus.dev","password":"secret123"}'
```

## 15. Brancher le frontend dessus

Une fois les routes testées :
1. Dans `src/environments/environment.development.ts`, `apiUrl` pointe déjà sur
   `http://localhost:4010` — pas de changement à faire côté frontend pour tester en
   local, il suffit d'arrêter `dev/mock-api.js` et de lancer ce vrai backend à la
   place, sur le même port.
2. Pour le suivi du temps spécifiquement, prévenez l'équipe frontend une fois
   `/tasks/{id}/timer/start|stop`, `/tasks/{id}/time-entries` et
   `/teams/{id}/active-timers` prêts : elle remplacera le mock `localStorage` de
   `time-tracking.service.ts` par de vrais appels `HttpClient` + un polling de
   5-10s. Aucun autre composant Angular n'a besoin de changer.
3. Pour la répétition de tâches, prévenez l'équipe frontend une fois
   `PUT/DELETE /tasks/{id}/recurrence` et le job planifié en place : elle
   remplacera le mock `localStorage` de `task-recurrence.service.ts` par de vrais
   appels `HttpClient`, et ajoutera le type `recurrence_due` au modèle
   `Notification` pour afficher le rappel dans le panneau de notifications
   existant.
4. Pour la to-do list, les liens et les notes, prévenez l'équipe frontend une fois
   les routes de la section 12 prêtes : elle remplacera les mocks `localStorage` de
   `checklist.service.ts`, `task-link.service.ts` et `task-note.service.ts` par de
   vrais appels `HttpClient`. Là encore, aucun autre composant Angular ne change.
5. La vue Calendrier ne nécessite aucune route supplémentaire — elle réutilise déjà
   les endpoints tâches/équipes/étiquettes existants.
6. Une fois tout validé, `dev/mock-api.js` peut être supprimé du dépôt.
