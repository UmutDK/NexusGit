# Backend PHP — guide d'implémentation complet

À lire après `01-presentation-application.md` (qui liste le contrat API complet — ce
document explique **comment le construire**, en PHP, sans framework). Objectif :
remplacer entièrement le mock [`dev/mock-api.js`](../../dev/mock-api.js) par un vrai
serveur avec une vraie base de données, une vraie authentification, et les bonnes
règles de permissions.

## 1. Stack recommandée

- **PHP 8.1+**, aucun framework (pas de Laravel/Symfony) — juste `composer.json`
  pour l'autoload PSR-4, comme vous en avez l'habitude.
- **Point d'entrée unique** : `public/index.php` (front controller) qui route à la
  main sur `$_SERVER['REQUEST_URI']` / `$_SERVER['REQUEST_METHOD']`, avec Apache/Nginx
  configurés pour tout rediriger dessus, ou le serveur intégré de PHP
  (`php -S localhost:4010 -t public`) pour le développement.
- **Base de données** : PDO + SQLite pour démarrer vite (fichier `.db`, zéro
  configuration). Toutes les requêtes ci-dessous sont en SQL générique — pour passer
  à MySQL en prod, seule `Database.php` change (DSN de connexion), le reste du code
  est identique.
- **Mots de passe** : `password_hash()` / `password_verify()`, intégrés à PHP
  (bcrypt), pas de dépendance à ajouter.
- **Tokens d'authentification** : un token opaque aléatoire (`random_bytes`) stocké
  en base (table `auth_tokens`), plus simple à faire sans dépendance qu'un vrai JWT
  signé. Chaque requête protégée fait un `SELECT` sur ce token pour retrouver
  l'utilisateur.
- **JSON / UUID** : `json_encode`/`json_decode` et une petite fonction `uuidv4()`
  maison (ci-dessous), tous deux natifs, pas de dépendance.

## 2. Structure de fichiers proposée

```
backend/
  composer.json                # autoload PSR-4 uniquement
  schema.sql                   # tout le schéma (section 3)
  public/
    index.php                  # front controller : démarre le routage
  src/
    Database.php                # connexion PDO
    Auth.php                    # hachage mot de passe, génération/vérification de token
    Helpers.php                 # exceptions, sérialisation, permissions
    Router.php                  # dispatch des routes
    Routes/
      AuthRoutes.php
      TeamRoutes.php
      BoardRoutes.php
      StatusRoutes.php
      TaskRoutes.php
      CommentRoutes.php
      LabelRoutes.php
      NotificationRoutes.php
      TimeTrackingRoutes.php
```

`composer.json` minimal :

```json
{
  "autoload": {
    "psr-4": { "Nexus\\": "src/" }
  }
}
```
(puis `composer dump-autoload`).

## 3. Schéma de base de données complet

```sql
CREATE TABLE users (
    id            VARCHAR(36) PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    DATETIME NOT NULL
);

CREATE TABLE auth_tokens (
    token      VARCHAR(64) PRIMARY KEY,
    user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL
);

CREATE TABLE teams (
    id            VARCHAR(36) PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    due_soon_days INT NOT NULL DEFAULT 7,
    created_at    DATETIME NOT NULL,
    updated_at    DATETIME NOT NULL
);

CREATE TABLE team_members (
    team_id   VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id   VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role      VARCHAR(20) NOT NULL CHECK (role IN ('coordinator', 'member')),
    joined_at DATETIME NOT NULL,
    PRIMARY KEY (team_id, user_id)
);

CREATE TABLE invitations (
    id         VARCHAR(36) PRIMARY KEY,
    team_id    VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email      VARCHAR(255) NOT NULL,
    token      VARCHAR(64) NOT NULL UNIQUE,     -- utilisé dans l'URL /invitations/{token}
    invited_by VARCHAR(36) NOT NULL REFERENCES users(id),
    status     VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL
);

CREATE TABLE boards (
    id         VARCHAR(36) PRIMARY KEY,
    team_id    VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name       VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE statuses (
    id          VARCHAR(36) PRIMARY KEY,
    board_id    VARCHAR(36) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    color       VARCHAR(20) NOT NULL DEFAULT '#94a3b8',
    position    DOUBLE NOT NULL,
    is_terminal TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL
);

CREATE TABLE tasks (
    id           VARCHAR(36) PRIMARY KEY,
    board_id     VARCHAR(36) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    status_id    VARCHAR(36) NOT NULL REFERENCES statuses(id),
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    priority     VARCHAR(20) NOT NULL CHECK (priority IN ('faible', 'moyenne', 'haute', 'critique')),
    due_date     DATE,
    position     DOUBLE NOT NULL,
    created_by   VARCHAR(36) NOT NULL REFERENCES users(id),
    completed_at DATETIME,
    created_at   DATETIME NOT NULL,
    updated_at   DATETIME NOT NULL
);

CREATE TABLE task_assignees (
    task_id VARCHAR(36) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
);

CREATE TABLE labels (
    id      VARCHAR(36) PRIMARY KEY,
    team_id VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name    VARCHAR(255) NOT NULL,
    color   VARCHAR(20) NOT NULL DEFAULT '#94a3b8',
    UNIQUE (team_id, name)
);

CREATE TABLE task_labels (
    task_id  VARCHAR(36) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label_id VARCHAR(36) NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

CREATE TABLE comments (
    id         VARCHAR(36) PRIMARY KEY,
    task_id    VARCHAR(36) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id  VARCHAR(36) NOT NULL REFERENCES users(id),
    body       TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE activity_log (
    id          VARCHAR(36) PRIMARY KEY,
    task_id     VARCHAR(36) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     VARCHAR(36) NOT NULL REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL,
    metadata    TEXT NOT NULL DEFAULT '{}',      -- JSON sérialisé en texte
    created_at  DATETIME NOT NULL
);

CREATE TABLE notifications (
    id              VARCHAR(36) PRIMARY KEY,
    user_id         VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
    task_id         VARCHAR(36) REFERENCES tasks(id) ON DELETE SET NULL,
    triggered_by_id VARCHAR(36) REFERENCES users(id),
    message         TEXT NOT NULL,
    is_read         TINYINT(1) NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL
);

CREATE TABLE time_entries (
    id               VARCHAR(36) PRIMARY KEY,
    task_id          VARCHAR(36) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    team_id          VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id          VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at       DATETIME NOT NULL,
    ended_at         DATETIME NULL,
    duration_seconds INT NULL,
    created_at       DATETIME NOT NULL
);

CREATE INDEX idx_time_entries_active ON time_entries (user_id, ended_at);
CREATE INDEX idx_time_entries_team   ON time_entries (team_id, started_at);
CREATE INDEX idx_tasks_board         ON tasks (board_id);
CREATE INDEX idx_statuses_board      ON statuses (board_id);
```

## 4. Connexion DB (`src/Database.php`)

```php
<?php

namespace Nexus;

use PDO;

final class Database
{
    private static ?PDO $instance = null;

    public static function get(): PDO
    {
        if (self::$instance === null) {
            $dbPath = __DIR__ . '/../nexus.db';
            self::$instance = new PDO('sqlite:' . $dbPath);
            self::$instance->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            self::$instance->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            self::$instance->exec('PRAGMA foreign_keys = ON');
        }
        return self::$instance;
    }

    public static function initSchema(): void
    {
        $schema = file_get_contents(__DIR__ . '/../schema.sql');
        self::get()->exec($schema);
    }
}
```

## 5. Authentification (`src/Auth.php`)

```php
<?php

namespace Nexus;

use PDO;

final class Auth
{
    private const TOKEN_TTL_DAYS = 30;

    public static function nowUtc(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d H:i:s');
    }

    public static function uuidv4(): string
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT);
    }

    public static function verifyPassword(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    public static function createToken(PDO $db, string $userId): string
    {
        $token = bin2hex(random_bytes(32));
        $expiresAt = (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))
            ->modify('+' . self::TOKEN_TTL_DAYS . ' days')
            ->format('Y-m-d H:i:s');

        $stmt = $db->prepare(
            'INSERT INTO auth_tokens (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$token, $userId, self::nowUtc(), $expiresAt]);
        return $token;
    }

    public static function userFromToken(PDO $db, ?string $token): ?array
    {
        if (!$token) {
            return null;
        }
        $stmt = $db->prepare(
            'SELECT users.* FROM auth_tokens
             JOIN users ON users.id = auth_tokens.user_id
             WHERE auth_tokens.token = ? AND auth_tokens.expires_at > ?'
        );
        $stmt->execute([$token, self::nowUtc()]);
        $row = $stmt->fetch();
        return $row ?: null;
    }
}
```

Routes d'auth (`src/Routes/AuthRoutes.php`) :

```php
<?php

namespace Nexus\Routes;

use Nexus\Auth;
use Nexus\Helpers\BadRequestException;
use Nexus\Helpers\UnauthorizedException;
use PDO;

final class AuthRoutes
{
    public static function serializeUser(array $row): array
    {
        return ['id' => $row['id'], 'name' => $row['name'], 'email' => $row['email'], 'createdAt' => $row['created_at']];
    }

    public static function register(PDO $db, array $body): array
    {
        if (empty($body['name']) || empty($body['email']) || empty($body['password'])) {
            throw new BadRequestException('name, email and password are required');
        }

        $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$body['email']]);
        if ($stmt->fetch()) {
            throw new BadRequestException('Email already registered');
        }

        $userId = Auth::uuidv4();
        $db->prepare(
            'INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)'
        )->execute([$userId, $body['name'], $body['email'], Auth::hashPassword($body['password']), Auth::nowUtc()]);

        $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        return ['accessToken' => Auth::createToken($db, $userId), 'user' => self::serializeUser($user)];
    }

    public static function login(PDO $db, array $body): array
    {
        $stmt = $db->prepare('SELECT * FROM users WHERE email = ?');
        $stmt->execute([$body['email'] ?? '']);
        $user = $stmt->fetch();

        if (!$user || !Auth::verifyPassword($body['password'] ?? '', $user['password_hash'])) {
            throw new UnauthorizedException('Invalid credentials');
        }

        return ['accessToken' => Auth::createToken($db, $user['id']), 'user' => self::serializeUser($user)];
    }

    public static function me(array $currentUser): array
    {
        return self::serializeUser($currentUser);
    }
}
```

## 6. Utilitaires partagés (`src/Helpers.php`)

```php
<?php

namespace Nexus\Helpers;

use PDO;

abstract class ApiException extends \RuntimeException
{
    public int $statusCode = 400;
}

final class BadRequestException extends ApiException { public int $statusCode = 400; }
final class UnauthorizedException extends ApiException { public int $statusCode = 401; }
final class ForbiddenException extends ApiException { public int $statusCode = 403; }
final class NotFoundException extends ApiException { public int $statusCode = 404; }
final class ConflictException extends ApiException { public int $statusCode = 409; }

final class Permissions
{
    public static function teamRole(PDO $db, string $userId, string $teamId): ?string
    {
        $stmt = $db->prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?');
        $stmt->execute([$teamId, $userId]);
        $row = $stmt->fetch();
        return $row ? $row['role'] : null;
    }

    public static function requireMember(PDO $db, string $userId, string $teamId): string
    {
        $role = self::teamRole($db, $userId, $teamId);
        if ($role === null) {
            throw new ForbiddenException('Not a member of this team');
        }
        return $role;
    }

    public static function requireCoordinator(PDO $db, string $userId, string $teamId): void
    {
        if (self::requireMember($db, $userId, $teamId) !== 'coordinator') {
            throw new ForbiddenException('Coordinator role required');
        }
    }

    public static function teamIdForBoard(PDO $db, string $boardId): ?string
    {
        $stmt = $db->prepare('SELECT team_id FROM boards WHERE id = ?');
        $stmt->execute([$boardId]);
        $row = $stmt->fetch();
        return $row ? $row['team_id'] : null;
    }

    public static function teamIdForTask(PDO $db, string $taskId): ?string
    {
        $stmt = $db->prepare(
            'SELECT boards.team_id FROM tasks JOIN boards ON boards.id = tasks.board_id WHERE tasks.id = ?'
        );
        $stmt->execute([$taskId]);
        $row = $stmt->fetch();
        return $row ? $row['team_id'] : null;
    }
}

final class ActivityLogger
{
    public static function log(PDO $db, string $taskId, string $userId, string $actionType, array $metadata = []): void
    {
        $db->prepare(
            'INSERT INTO activity_log (id, task_id, user_id, action_type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([
            \Nexus\Auth::uuidv4(), $taskId, $userId, $actionType, json_encode($metadata), \Nexus\Auth::nowUtc(),
        ]);
    }
}
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

## 7. Front controller & routage

`public/index.php` :

```php
<?php

require __DIR__ . '/../vendor/autoload.php';

use Nexus\Database;
use Nexus\Router;

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: *');
header('Access-Control-Allow-Methods: *');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

Database::initSchema(); // idempotent (CREATE TABLE IF NOT EXISTS dans schema.sql), ou à sortir en script de migration séparé

header('Content-Type: application/json');
Router::dispatch();
```

`src/Router.php` :

```php
<?php

namespace Nexus;

use Nexus\Helpers\ApiException;
use Nexus\Helpers\UnauthorizedException;
use Nexus\Routes\{
    AuthRoutes, TeamRoutes, BoardRoutes, StatusRoutes,
    TaskRoutes, CommentRoutes, LabelRoutes, NotificationRoutes,
};

final class Router
{
    private static array $publicRoutes = [
        'POST /auth/register',
        'POST /auth/login',
    ];

    public static function dispatch(): void
    {
        $method = $_SERVER['REQUEST_METHOD'];
        $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        parse_str(parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY) ?? '', $query);
        $segments = array_values(array_filter(explode('/', $path)));
        $db = Database::get();

        try {
            $currentUser = null;
            if (!in_array("$method $path", self::$publicRoutes, true)) {
                $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
                $token = str_starts_with($header, 'Bearer ') ? substr($header, 7) : null;
                $currentUser = Auth::userFromToken($db, $token);
                if ($currentUser === null) {
                    throw new UnauthorizedException('Missing or invalid token');
                }
            }

            $body = in_array($method, ['POST', 'PATCH', 'PUT'], true)
                ? (json_decode(file_get_contents('php://input'), true) ?? [])
                : [];

            $result = self::route($db, $method, $segments, $body, $query, $currentUser);
            echo json_encode($result ?? new \stdClass());
        } catch (ApiException $e) {
            http_response_code($e->statusCode);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Internal server error']);
            error_log($e->getMessage());
        }
    }

    private static function route(\PDO $db, string $method, array $seg, array $body, array $query, ?array $user)
    {
        if (($seg[0] ?? null) === 'auth') {
            if ($seg === ['auth', 'register']) return AuthRoutes::register($db, $body);
            if ($seg === ['auth', 'login']) return AuthRoutes::login($db, $body);
            if ($seg === ['auth', 'me']) return AuthRoutes::me($user);
        }

        if (($seg[0] ?? null) === 'teams') return TeamRoutes::route($db, $method, $seg, $body, $query, $user);
        if (($seg[0] ?? null) === 'boards') return BoardRoutes::route($db, $method, $seg, $body, $user);
        if (($seg[0] ?? null) === 'statuses') return StatusRoutes::route($db, $method, $seg, $body, $user);
        if (($seg[0] ?? null) === 'tasks') return TaskRoutes::route($db, $method, $seg, $body, $user);
        if (($seg[0] ?? null) === 'comments') return CommentRoutes::route($db, $method, $seg, $body, $user);
        if (($seg[0] ?? null) === 'labels') return LabelRoutes::route($db, $method, $seg, $body, $user);
        if (($seg[0] ?? null) === 'notifications') return NotificationRoutes::route($db, $method, $seg, $query, $user);
        if (($seg[0] ?? null) === 'invitations') return TeamRoutes::acceptInvitation($db, $seg[1], $user);

        throw new \Nexus\Helpers\NotFoundException('Route not found');
    }
}
```

## 8. Équipes (`src/Routes/TeamRoutes.php`)

```php
<?php

namespace Nexus\Routes;

use Nexus\Auth;
use Nexus\Helpers\{BadRequestException, NotFoundException, Permissions};
use PDO;

final class TeamRoutes
{
    public static function serializeTeam(PDO $db, array $row, string $userId): array
    {
        $role = Permissions::teamRole($db, $userId, $row['id']);
        $stmt = $db->prepare('SELECT COUNT(*) n FROM team_members WHERE team_id = ?');
        $stmt->execute([$row['id']]);
        return [
            'id' => $row['id'], 'name' => $row['name'], 'dueSoonDays' => (int) $row['due_soon_days'],
            'memberCount' => (int) $stmt->fetch()['n'], 'myRole' => $role,
            'createdAt' => $row['created_at'], 'updatedAt' => $row['updated_at'],
        ];
    }

    public static function serializeMember(array $row): array
    {
        return [
            'user' => ['id' => $row['id'], 'name' => $row['name'], 'email' => $row['email'], 'createdAt' => $row['user_created_at']],
            'role' => $row['role'], 'joinedAt' => $row['joined_at'],
        ];
    }

    public static function listTeams(PDO $db, array $user): array
    {
        $stmt = $db->prepare(
            'SELECT teams.* FROM teams
             JOIN team_members ON team_members.team_id = teams.id
             WHERE team_members.user_id = ?'
        );
        $stmt->execute([$user['id']]);
        return array_map(fn ($r) => self::serializeTeam($db, $r, $user['id']), $stmt->fetchAll());
    }

    public static function createTeam(PDO $db, array $body, array $user): array
    {
        if (empty($body['name'])) throw new BadRequestException('name is required');

        $teamId = Auth::uuidv4();
        $now = Auth::nowUtc();
        $db->prepare('INSERT INTO teams (id, name, due_soon_days, created_at, updated_at) VALUES (?, ?, 7, ?, ?)')
            ->execute([$teamId, $body['name'], $now, $now]);
        $db->prepare("INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'coordinator', ?)")
            ->execute([$teamId, $user['id'], $now]);

        $stmt = $db->prepare('SELECT * FROM teams WHERE id = ?');
        $stmt->execute([$teamId]);
        return self::serializeTeam($db, $stmt->fetch(), $user['id']);
    }

    public static function getTeam(PDO $db, string $teamId, array $user): array
    {
        Permissions::requireMember($db, $user['id'], $teamId);
        $stmt = $db->prepare('SELECT * FROM teams WHERE id = ?');
        $stmt->execute([$teamId]);
        $team = $stmt->fetch();
        if (!$team) throw new NotFoundException('Team not found');
        return self::serializeTeam($db, $team, $user['id']);
    }

    public static function updateTeam(PDO $db, string $teamId, array $body, array $user): array
    {
        Permissions::requireCoordinator($db, $user['id'], $teamId);

        $fields = []; $params = [];
        if (array_key_exists('name', $body)) { $fields[] = 'name = ?'; $params[] = $body['name']; }
        if (array_key_exists('dueSoonDays', $body)) { $fields[] = 'due_soon_days = ?'; $params[] = $body['dueSoonDays']; }

        if ($fields) {
            $params[] = Auth::nowUtc();
            $params[] = $teamId;
            $db->prepare('UPDATE teams SET ' . implode(', ', $fields) . ', updated_at = ? WHERE id = ?')->execute($params);
        }

        $stmt = $db->prepare('SELECT * FROM teams WHERE id = ?');
        $stmt->execute([$teamId]);
        return self::serializeTeam($db, $stmt->fetch(), $user['id']);
    }

    public static function deleteTeam(PDO $db, string $teamId, array $user): void
    {
        Permissions::requireCoordinator($db, $user['id'], $teamId);
        $db->prepare('DELETE FROM teams WHERE id = ?')->execute([$teamId]); // cascade via FOREIGN KEY
    }

    public static function listMembers(PDO $db, string $teamId, array $user): array
    {
        Permissions::requireMember($db, $user['id'], $teamId);
        $stmt = $db->prepare(
            'SELECT users.id, users.name, users.email, users.created_at AS user_created_at,
                    team_members.role, team_members.joined_at
             FROM team_members JOIN users ON users.id = team_members.user_id
             WHERE team_members.team_id = ?'
        );
        $stmt->execute([$teamId]);
        return array_map([self::class, 'serializeMember'], $stmt->fetchAll());
    }

    public static function updateMemberRole(PDO $db, string $teamId, string $targetUserId, array $body, array $user): array
    {
        Permissions::requireCoordinator($db, $user['id'], $teamId);
        $db->prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?')
            ->execute([$body['role'], $teamId, $targetUserId]);

        $stmt = $db->prepare(
            'SELECT users.id, users.name, users.email, users.created_at AS user_created_at,
                    team_members.role, team_members.joined_at
             FROM team_members JOIN users ON users.id = team_members.user_id
             WHERE team_id = ? AND user_id = ?'
        );
        $stmt->execute([$teamId, $targetUserId]);
        return self::serializeMember($stmt->fetch());
    }

    public static function removeMember(PDO $db, string $teamId, string $targetUserId, array $user): void
    {
        Permissions::requireCoordinator($db, $user['id'], $teamId);
        $db->prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?')->execute([$teamId, $targetUserId]);
    }

    public static function buildDashboard(PDO $db, string $teamId, array $user): array
    {
        Permissions::requireMember($db, $user['id'], $teamId);

        $total = self::scalar($db,
            'SELECT COUNT(*) n FROM tasks JOIN boards ON boards.id = tasks.board_id WHERE boards.team_id = ?',
            [$teamId]);

        $completed = self::scalar($db,
            'SELECT COUNT(*) n FROM tasks
             JOIN boards ON boards.id = tasks.board_id
             JOIN statuses ON statuses.id = tasks.status_id
             WHERE boards.team_id = ? AND statuses.is_terminal = 1',
            [$teamId]);

        $toStart = self::scalar($db,
            'SELECT COUNT(*) n FROM tasks t
             JOIN statuses s ON s.id = t.status_id
             JOIN boards b ON b.id = t.board_id
             WHERE b.team_id = ? AND s.position = (
                 SELECT MIN(s2.position) FROM statuses s2 WHERE s2.board_id = s.board_id AND s2.is_terminal = 0
             )',
            [$teamId]);

        $stmt = $db->prepare(
            'SELECT tasks.* FROM tasks JOIN boards ON boards.id = tasks.board_id
             WHERE boards.team_id = ? ORDER BY tasks.created_at DESC LIMIT 3'
        );
        $stmt->execute([$teamId]);
        $recentTasks = array_map(fn ($r) => TaskRoutes::serializeTask($db, $r), $stmt->fetchAll());

        return [
            'totalTasks' => $total, 'inProgress' => max($total - $completed - $toStart, 0),
            'completed' => $completed, 'toStart' => $toStart,
            'teamMembers' => self::listMembers($db, $teamId, $user), 'recentTasks' => $recentTasks,
        ];
    }

    private static function scalar(PDO $db, string $sql, array $params): int
    {
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetch()['n'];
    }

    public static function createInvitation(PDO $db, string $teamId, array $body, array $user): array
    {
        Permissions::requireCoordinator($db, $user['id'], $teamId);

        $invitationId = Auth::uuidv4();
        $token = bin2hex(random_bytes(24));
        $now = Auth::nowUtc();
        $expires = (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->modify('+7 days')->format('Y-m-d H:i:s');

        $db->prepare(
            "INSERT INTO invitations (id, team_id, email, token, invited_by, status, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)"
        )->execute([$invitationId, $teamId, $body['email'], $token, $user['id'], $now, $expires]);

        // TODO: envoyer un email avec le lien http://<frontend>/invitations/{token}

        $stmt = $db->prepare('SELECT * FROM invitations WHERE id = ?');
        $stmt->execute([$invitationId]);
        return self::serializeInvitation($db, $stmt->fetch());
    }

    private static function serializeInvitation(PDO $db, array $row): array
    {
        $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$row['invited_by']]);
        return [
            'id' => $row['id'], 'email' => $row['email'], 'invitedBy' => AuthRoutes::serializeUser($stmt->fetch()),
            'status' => $row['status'], 'createdAt' => $row['created_at'], 'expiresAt' => $row['expires_at'],
        ];
    }

    public static function listInvitations(PDO $db, string $teamId, array $user): array
    {
        Permissions::requireCoordinator($db, $user['id'], $teamId);
        $stmt = $db->prepare('SELECT * FROM invitations WHERE team_id = ?');
        $stmt->execute([$teamId]);
        return array_map(fn ($r) => self::serializeInvitation($db, $r), $stmt->fetchAll());
    }

    public static function revokeInvitation(PDO $db, string $teamId, string $invitationId, array $user): array
    {
        Permissions::requireCoordinator($db, $user['id'], $teamId);
        $db->prepare("UPDATE invitations SET status = 'revoked' WHERE id = ? AND team_id = ?")
            ->execute([$invitationId, $teamId]);

        $stmt = $db->prepare('SELECT * FROM invitations WHERE id = ?');
        $stmt->execute([$invitationId]);
        return self::serializeInvitation($db, $stmt->fetch());
    }

    public static function acceptInvitation(PDO $db, string $token, array $user): array
    {
        $stmt = $db->prepare('SELECT * FROM invitations WHERE token = ?');
        $stmt->execute([$token]);
        $invitation = $stmt->fetch();

        if (!$invitation || $invitation['status'] !== 'pending') {
            throw new NotFoundException('Invitation not found or no longer valid');
        }

        $db->prepare("UPDATE invitations SET status = 'accepted' WHERE id = ?")->execute([$invitation['id']]);

        $check = $db->prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?');
        $check->execute([$invitation['team_id'], $user['id']]);
        if (!$check->fetch()) {
            $db->prepare("INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)")
                ->execute([$invitation['team_id'], $user['id'], Auth::nowUtc()]);
        }

        $stmt = $db->prepare('SELECT * FROM teams WHERE id = ?');
        $stmt->execute([$invitation['team_id']]);
        return self::serializeTeam($db, $stmt->fetch(), $user['id']);
    }

    public static function route(PDO $db, string $method, array $seg, array $body, array $query, array $user)
    {
        if (count($seg) === 1) {
            return $method === 'POST' ? self::createTeam($db, $body, $user) : self::listTeams($db, $user);
        }

        $teamId = $seg[1];

        if (count($seg) === 2) {
            if ($method === 'PATCH') return self::updateTeam($db, $teamId, $body, $user);
            if ($method === 'DELETE') { self::deleteTeam($db, $teamId, $user); return null; }
            return self::getTeam($db, $teamId, $user);
        }

        $sub = $seg[2];

        if ($sub === 'dashboard') return self::buildDashboard($db, $teamId, $user);

        if ($sub === 'members') {
            if (count($seg) === 3) return self::listMembers($db, $teamId, $user);
            $targetUserId = $seg[3];
            if ($method === 'PATCH') return self::updateMemberRole($db, $teamId, $targetUserId, $body, $user);
            if ($method === 'DELETE') { self::removeMember($db, $teamId, $targetUserId, $user); return null; }
        }

        if ($sub === 'invitations') {
            if (count($seg) === 3) {
                return $method === 'POST'
                    ? self::createInvitation($db, $teamId, $body, $user)
                    : self::listInvitations($db, $teamId, $user);
            }
            if (count($seg) === 4 && $method === 'PATCH') return self::revokeInvitation($db, $teamId, $seg[3], $user);
        }

        if ($sub === 'boards') {
            return $method === 'POST'
                ? BoardRoutes::createForTeam($db, $teamId, $body, $user)
                : BoardRoutes::listForTeam($db, $teamId, $user);
        }

        if ($sub === 'labels') {
            return $method === 'POST'
                ? LabelRoutes::createForTeam($db, $teamId, $body, $user)
                : LabelRoutes::listForTeam($db, $teamId, $user);
        }

        if ($sub === 'active-timers') return TimeTrackingRoutes::listActive($db, $teamId, $user);
        if ($sub === 'time-entries') return TimeTrackingRoutes::listEntries($db, $teamId, $query, $user);

        throw new NotFoundException('Route not found');
    }
}
```

## 9. Tableaux, statuts, tâches, commentaires, étiquettes, notifications

Ces classes suivent **exactement le même schéma** que `TeamRoutes` :
1. une méthode `serializeXxx(array $row)` qui transforme une ligne PDO en tableau
   avec les clés `camelCase` attendues par le frontend,
2. une méthode par action (list/get/create/update/delete),
3. un contrôle de permission systématique via `Permissions::requireMember`/
   `requireCoordinator` en résolvant l'équipe concernée (`Permissions::teamIdForBoard`,
   `Permissions::teamIdForTask`),
4. une méthode statique `route(...)` qui dispatch les sous-chemins.

Le contrat exact de chaque route (méthode, chemin, body, réponse) est dans
`01-presentation-application.md`, section 5 — utilise-le comme check-list. Points
spécifiques à ne pas oublier :

- **`PATCH /tasks/{id}` sert aussi au drag & drop** : accepte `{ statusId, position }`
  où `position` est un flottant (`DOUBLE`), pas un entier — le frontend envoie la
  moyenne entre les deux tâches voisines pour insérer sans tout renuméroter.
- **`PUT /tasks/{id}/assignees`** et **`PUT /tasks/{id}/labels`** *remplacent*
  entièrement la liste (pas un ajout) : `DELETE` puis ré-`INSERT` dans la table de
  jointure (`task_assignees`/`task_labels`) à partir de `userIds`/`labelIds`.
- **Historique d'activité** : appelle `ActivityLogger::log($db, $taskId, $userId,
  $actionType, $metadata)` (section 6) à chaque `PATCH /tasks/{id}` qui change
  `statusId`/`priority`, à chaque (dés)assignation, ajout/retrait d'étiquette, et à
  la création d'un commentaire. C'est ce flux qui alimente
  `GET /tasks/{id}/activity`.
- **Notifications à générer côté serveur** (pas par le frontend) :
  - `assigned` quand un utilisateur est ajouté à `assignees`,
  - `comment_added` pour les autres assignés quand quelqu'un commente,
  - `due_date_soon` : à calculer soit à la volée dans une tâche cron qui compare
    `due_date` à `due_soon_days` de l'équipe, soit paresseusement à la connexion —
    à voir avec l'équipe frontend selon la volumétrie attendue.
  - `manual_reminder` est déjà couvert par `POST /tasks/{id}/remind` (créé
    directement dans le handler, pas de logique différée).
- **Étiquettes** : `UNIQUE (team_id, name)` en base fait le gros du travail —
  intercepte l'erreur d'intégrité (`PDOException` code `23000`) et renvoie
  `409 { "error": "..." }` comme le fait le mock.

## 10. Suivi du temps (chrono) — `src/Routes/TimeTrackingRoutes.php`

Nouvelle fonctionnalité, absente du mock actuel. Rappel des règles :

- **Un seul chrono actif par utilisateur à la fois**, tous tableaux confondus : en
  démarrer un nouveau clôture automatiquement l'ancien.
- Les autres membres de l'équipe voient qui a un chrono actif via un endpoint que le
  frontend **poll** toutes les 5-10 secondes (pas de WebSocket nécessaire).

```php
<?php

namespace Nexus\Routes;

use Nexus\Auth;
use Nexus\Helpers\{ConflictException, NotFoundException, Permissions};
use PDO;

final class TimeTrackingRoutes
{
    private static function serializeEntry(array $row): array
    {
        return [
            'id' => $row['id'], 'taskId' => $row['task_id'], 'taskTitle' => $row['task_title'],
            'teamId' => $row['team_id'], 'userId' => $row['user_id'], 'userName' => $row['user_name'],
            'startedAt' => $row['started_at'], 'endedAt' => $row['ended_at'],
            'durationSeconds' => $row['duration_seconds'] !== null ? (int) $row['duration_seconds'] : null,
        ];
    }

    private static function withJoins(PDO $db, string $entryId): array
    {
        $stmt = $db->prepare(
            'SELECT te.*, tasks.title AS task_title, users.name AS user_name
             FROM time_entries te
             JOIN tasks ON tasks.id = te.task_id
             JOIN users ON users.id = te.user_id
             WHERE te.id = ?'
        );
        $stmt->execute([$entryId]);
        return $stmt->fetch();
    }

    public static function startTimer(PDO $db, string $taskId, array $user): array
    {
        $teamId = Permissions::teamIdForTask($db, $taskId);
        if ($teamId === null) throw new NotFoundException('Task not found');
        Permissions::requireMember($db, $user['id'], $teamId);

        $now = Auth::nowUtc();

        $stmt = $db->prepare('SELECT * FROM time_entries WHERE user_id = ? AND ended_at IS NULL');
        $stmt->execute([$user['id']]);
        $active = $stmt->fetch();

        if ($active) {
            $duration = strtotime($now) - strtotime($active['started_at']);
            $db->prepare('UPDATE time_entries SET ended_at = ?, duration_seconds = ? WHERE id = ?')
                ->execute([$now, $duration, $active['id']]);
        }

        $entryId = Auth::uuidv4();
        $db->prepare(
            'INSERT INTO time_entries (id, task_id, team_id, user_id, started_at, ended_at, duration_seconds, created_at)
             VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)'
        )->execute([$entryId, $taskId, $teamId, $user['id'], $now, $now]);

        return self::serializeEntry(self::withJoins($db, $entryId));
    }

    public static function stopTimer(PDO $db, string $taskId, array $user): array
    {
        $stmt = $db->prepare(
            'SELECT * FROM time_entries WHERE user_id = ? AND task_id = ? AND ended_at IS NULL'
        );
        $stmt->execute([$user['id'], $taskId]);
        $active = $stmt->fetch();
        if (!$active) throw new ConflictException('No active timer for this task');

        $now = Auth::nowUtc();
        $duration = strtotime($now) - strtotime($active['started_at']);
        $db->prepare('UPDATE time_entries SET ended_at = ?, duration_seconds = ? WHERE id = ?')
            ->execute([$now, $duration, $active['id']]);

        return self::serializeEntry(self::withJoins($db, $active['id']));
    }

    public static function listActive(PDO $db, string $teamId, array $user): array
    {
        Permissions::requireMember($db, $user['id'], $teamId);
        $stmt = $db->prepare(
            'SELECT te.*, tasks.title AS task_title, users.name AS user_name
             FROM time_entries te
             JOIN tasks ON tasks.id = te.task_id
             JOIN users ON users.id = te.user_id
             WHERE te.team_id = ? AND te.ended_at IS NULL'
        );
        $stmt->execute([$teamId]);
        return array_map([self::class, 'serializeEntry'], $stmt->fetchAll());
    }

    public static function listEntries(PDO $db, string $teamId, array $query, array $user): array
    {
        Permissions::requireMember($db, $user['id'], $teamId);

        $sql = 'SELECT te.*, tasks.title AS task_title, users.name AS user_name
                FROM time_entries te
                JOIN tasks ON tasks.id = te.task_id
                JOIN users ON users.id = te.user_id
                WHERE te.team_id = ?';
        $params = [$teamId];

        if (!empty($query['userId'])) { $sql .= ' AND te.user_id = ?'; $params[] = $query['userId']; }
        if (!empty($query['taskId'])) { $sql .= ' AND te.task_id = ?'; $params[] = $query['taskId']; }
        if (!empty($query['from'])) { $sql .= ' AND te.started_at >= ?'; $params[] = $query['from']; }
        if (!empty($query['to'])) { $sql .= ' AND te.started_at <= ?'; $params[] = $query['to']; }
        $sql .= ' ORDER BY te.started_at DESC';

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        return array_map([self::class, 'serializeEntry'], $stmt->fetchAll());
    }
}
```

Branche ces méthodes :
- `POST /tasks/{id}/timer/start` et `POST /tasks/{id}/timer/stop` → dans
  `TaskRoutes::route`, aux côtés de `remind`/`comments`/`activity`.
- `GET /teams/{id}/active-timers` et `GET /teams/{id}/time-entries` → déjà câblés
  dans `TeamRoutes::route` (section 8, en fin de méthode).

## 11. Répétition de tâches (rappel tous les X jours) — `src/Routes/RecurrenceRoutes.php` + `cron_recurrence.php`

Nouvelle fonctionnalité, absente du mock actuel. Contrairement à tout ce qui
précède, **le simple CRUD ne suffit pas** : il faut aussi qu'un job tourne tout
seul côté serveur pour déclencher le rappel au bon moment, même quand personne n'a
l'application ouverte.

### Schéma

```sql
CREATE TABLE task_recurrences (
    task_id           VARCHAR(36) PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    interval_count    INT NOT NULL,
    unit              VARCHAR(10) NOT NULL CHECK (unit IN ('day', 'week', 'month')),
    last_triggered_at DATE,          -- date de la dernière occurrence notifiée
    created_at        DATETIME NOT NULL,
    updated_at        DATETIME NOT NULL
);
```
Une tâche a au plus une règle (`task_id` est la clé primaire) — pas de ligne =
pas de répétition.

### Endpoints CRUD

Le frontend attend ce format JSON pour une règle (`TaskRecurrence`) :
```json
{ "taskId": "tk4", "interval": 2, "unit": "week" }
```

```php
<?php

namespace Nexus\Routes;

use Nexus\Auth;
use Nexus\Helpers\{NotFoundException, Permissions};
use PDO;

final class RecurrenceRoutes
{
    private static function serialize(array $row): array
    {
        return ['taskId' => $row['task_id'], 'interval' => (int) $row['interval_count'], 'unit' => $row['unit']];
    }

    public static function setRecurrence(PDO $db, string $taskId, array $body, array $user): array
    {
        $teamId = Permissions::teamIdForTask($db, $taskId);
        if ($teamId === null) throw new NotFoundException('Task not found');
        Permissions::requireMember($db, $user['id'], $teamId);

        $now = Auth::nowUtc();
        $stmt = $db->prepare('SELECT 1 FROM task_recurrences WHERE task_id = ?');
        $stmt->execute([$taskId]);

        if ($stmt->fetch()) {
            $db->prepare('UPDATE task_recurrences SET interval_count = ?, unit = ?, updated_at = ? WHERE task_id = ?')
                ->execute([$body['interval'], $body['unit'], $now, $taskId]);
        } else {
            $db->prepare(
                'INSERT INTO task_recurrences (task_id, interval_count, unit, last_triggered_at, created_at, updated_at)
                 VALUES (?, ?, ?, NULL, ?, ?)'
            )->execute([$taskId, $body['interval'], $body['unit'], $now, $now]);
        }

        $stmt = $db->prepare('SELECT * FROM task_recurrences WHERE task_id = ?');
        $stmt->execute([$taskId]);
        return self::serialize($stmt->fetch());
    }

    public static function deleteRecurrence(PDO $db, string $taskId, array $user): void
    {
        $teamId = Permissions::teamIdForTask($db, $taskId);
        if ($teamId === null) throw new NotFoundException('Task not found');
        Permissions::requireMember($db, $user['id'], $teamId);
        $db->prepare('DELETE FROM task_recurrences WHERE task_id = ?')->execute([$taskId]);
    }
}
```

Branche `PUT /tasks/{id}/recurrence` → `setRecurrence` et
`DELETE /tasks/{id}/recurrence` → `deleteRecurrence`, dans `TaskRoutes::route`.

### Le job planifié (`cron_recurrence.php`)

Un script **indépendant du serveur web**, lancé une fois par jour par le
planificateur du système (`cron` sous Linux/macOS, Planificateur de tâches sous
Windows) — pas une boucle qui tourne en continu dans le process PHP-FPM.

Algorithme : pour chaque règle, on recalcule la prochaine occurrence en partant de
l'échéance de la tâche (ou de sa date de création si pas d'échéance) et en avançant
par pas de `interval_count`/`unit` jusqu'à dépasser `last_triggered_at` (ou
aujourd'hui, à la première exécution) — c'est exactement le même calcul que
`nextOccurrence()` côté frontend (`src/app/shared/utils/recurrence.util.ts`), pour
que la date affichée dans l'UI corresponde à celle qui déclenche vraiment le
rappel. Si cette occurrence tombe aujourd'hui (ou avant, si le job n'a pas tourné
un jour), on notifie et on marque `last_triggered_at` pour ne pas notifier deux
fois la même occurrence.

```php
<?php

require __DIR__ . '/vendor/autoload.php';

use Nexus\Auth;
use Nexus\Database;

function advanceDate(\DateTimeImmutable $date, int $interval, string $unit): \DateTimeImmutable
{
    return match ($unit) {
        'day' => $date->modify("+{$interval} days"),
        'week' => $date->modify("+{$interval} weeks"),
        default => $date->modify("+{$interval} months"),
    };
}

function nextOccurrence(\DateTimeImmutable $anchor, int $interval, string $unit, \DateTimeImmutable $after): \DateTimeImmutable
{
    $next = $anchor;
    while ($next <= $after) {
        $next = advanceDate($next, $interval, $unit);
    }
    return $next;
}

$db = Database::get();
$today = new \DateTimeImmutable('today');

$rules = $db->query(
    'SELECT task_recurrences.*, tasks.due_date, tasks.created_at AS task_created_at, tasks.title
     FROM task_recurrences JOIN tasks ON tasks.id = task_recurrences.task_id'
)->fetchAll();

foreach ($rules as $rule) {
    $anchor = new \DateTimeImmutable($rule['due_date'] ?? $rule['task_created_at']);
    $after = $rule['last_triggered_at'] ? new \DateTimeImmutable($rule['last_triggered_at']) : $anchor;
    $occurrence = nextOccurrence($anchor, (int) $rule['interval_count'], $rule['unit'], $after);

    if ($occurrence <= $today) {
        $assignees = $db->prepare('SELECT user_id FROM task_assignees WHERE task_id = ?');
        $assignees->execute([$rule['task_id']]);

        foreach ($assignees->fetchAll() as $a) {
            $db->prepare(
                "INSERT INTO notifications (id, user_id, type, task_id, triggered_by_id, message, is_read, created_at)
                 VALUES (?, ?, 'recurrence_due', ?, NULL, ?, 0, ?)"
            )->execute([
                Auth::uuidv4(), $a['user_id'], $rule['task_id'],
                "Rappel récurrent : \"{$rule['title']}\" revient aujourd'hui.", Auth::nowUtc(),
            ]);
        }

        $db->prepare('UPDATE task_recurrences SET last_triggered_at = ? WHERE task_id = ?')
            ->execute([$occurrence->format('Y-m-d'), $rule['task_id']]);
    }
}
```

Planifie-le avec une entrée crontab (exécution tous les jours à 7h) :
```
0 7 * * * cd /chemin/vers/backend && /usr/bin/php cron_recurrence.php >> cron.log 2>&1
```

Le type `recurrence_due` est un nouveau `NotificationType` à ajouter côté frontend
(`src/app/core/models/notification.model.ts`) quand vous serez prêts à brancher
cette fonctionnalité — prévenez l'équipe frontend à ce moment-là.

## 12. CORS

Déjà géré dans `public/index.php` (en-têtes `Access-Control-Allow-*` sur toute
réponse, `OPTIONS` répond `204` à la pré-requête du navigateur) — à restreindre à
l'origine réelle du frontend en production plutôt que `*`.

## 13. Démarrage et tests

```bash
cd backend
composer dump-autoload
php -S localhost:4010 -t public
# dans un autre terminal :
curl -X POST http://localhost:4010/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@nexus.dev","password":"secret123"}'
```

## 14. Brancher le frontend dessus

Une fois les routes testées :
1. Dans `src/environments/environment.development.ts`, `apiUrl` pointe déjà sur
   `http://localhost:4010` — pas de changement à faire côté frontend pour tester en
   local, il suffit d'arrêter `dev/mock-api.js` et de lancer ce vrai backend à la
   place, sur le même port.
2. Pour le suivi du temps spécifiquement, prévenez l'équipe frontend une fois
   `/tasks/{id}/timer/start|stop` et `/teams/{id}/active-timers` prêts : elle
   remplacera le mock `localStorage` de `time-tracking.service.ts` par de vrais
   appels `HttpClient` + un polling de 5-10s. Aucun autre composant Angular n'a
   besoin de changer.
3. Pour la répétition de tâches, prévenez l'équipe frontend une fois
   `PUT/DELETE /tasks/{id}/recurrence` et le job planifié en place : elle
   remplacera le mock `localStorage` de `task-recurrence.service.ts` par de vrais
   appels `HttpClient`, et ajoutera le type `recurrence_due` au modèle
   `Notification` pour afficher le rappel dans le panneau de notifications
   existant.
4. Une fois tout validé, `dev/mock-api.js` peut être supprimé du dépôt.
