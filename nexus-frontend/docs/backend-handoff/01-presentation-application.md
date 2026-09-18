# Nexus — présentation de l'application (pour le développeur backend)

Ce document explique ce qu'est l'application Nexus, comment le frontend et le backend
communiquent, et liste **tous les endpoints REST que le frontend Angular attend déjà**
aujourd'hui. Il sert de référence avant d'attaquer le développement du vrai backend.

Deux autres documents complètent celui-ci avec un guide d'implémentation complet du
backend (schéma de base de données, authentification, tous les endpoints, y compris
le suivi du temps, la répétition de tâches, la to-do list, les liens et les notes) —
un par langage envisagé, à choisir selon la décision finale :
- `02-backend-python-guide-complet.md`
- `03-backend-php-guide-complet.md` *(pas encore mis à jour avec les nouveautés
  listées ci-dessus — dites-le si vous partez sur PHP et qu'il faut le rattraper)*

---

## 1. Qu'est-ce que Nexus ?

Un outil de gestion de tâches en équipe, façon Trello/Kanban :

- Un utilisateur appartient à une ou plusieurs **équipes** (Team).
- Chaque équipe a un ou plusieurs **tableaux** (Board) — ex. "Sprint Juillet 2026".
- Chaque tableau a des **colonnes/statuts** (Status) — ex. "À faire", "En cours", "Terminé".
- Chaque statut contient des **tâches** (Task) : titre, description, priorité, échéance,
  assignés, étiquettes, commentaires, historique d'activité.
- Un rôle par équipe : `coordinator` (peut tout gérer, inviter, renommer, supprimer) ou
  `member`.

## 2. État actuel du projet

- **Le frontend Angular est fonctionnellement terminé** pour tout ce qui est décrit dans
  ce document (auth, équipes, tableaux, tâches, commentaires, notifications...).
- **Le vrai backend n'existe pas encore.** En attendant, le frontend tourne contre un
  mock local : [`dev/mock-api.js`](../../dev/mock-api.js) (Node.js, aucune dépendance),
  qui simule exactement les réponses que le frontend attend, écoute sur
  `http://localhost:4010`, et sert de **spec vivante** — en cas de doute sur une réponse
  attendue, ce fichier fait foi.
- Le travail du backend consiste à reproduire ce même contrat (mêmes routes, mêmes
  formes de JSON) avec un vrai stockage en base de données, une vraie authentification,
  et les vraies règles métier.
- Une fois le vrai backend prêt, `dev/mock-api.js` sera supprimé et le frontend pointera
  dessus (variable `apiUrl` dans `src/environments/`).
- Une vue **Calendrier** (par équipe, filtrable par personne/étiquette/priorité,
  tâches placées sur leur échéance) a aussi été ajoutée — elle ne réutilise que des
  endpoints déjà listés en §5 (tâches/équipes/étiquettes), **aucun travail backend
  supplémentaire n'est nécessaire** pour cette vue-là.

## 3. Comment le frontend appelle le backend

- Format : **REST + JSON**, aucune contrainte de framework côté serveur.
- Base URL : configurée dans `src/environments/environment.development.ts`
  (`http://localhost:4010` en dev) et `environment.ts` (`/api/v1` en prod, donc passé
  derrière un reverse proxy le jour du déploiement).
- **Authentification** : `Authorization: Bearer <token>` sur toutes les routes sauf
  `/auth/register`, `/auth/login` et `/invitations/{token}/accept`. Le token est stocké
  côté frontend dans `localStorage`.
- **CORS** : le backend doit autoriser les requêtes depuis `http://localhost:4200` (dev)
  et l'origine de prod, avec les méthodes/headers utilisés (`GET/POST/PATCH/PUT/DELETE`,
  `Content-Type`, `Authorization`).
- **Convention d'erreur** observée dans le mock : statut HTTP non-2xx + corps
  `{ "error": "message" }` (ex. 409 quand une étiquette existe déjà pour l'équipe).
- Les dates sont des chaînes ISO 8601 (`"2026-07-28T00:00:00Z"` ou juste `"2026-07-28"`
  pour `dueDate`).
- Les identifiants sont des chaînes (le mock utilise des préfixes du style `u1`, `tk1`,
  `t1789227833479`) — libre au backend d'utiliser des UUID ou des ids auto-incrémentés
  convertis en string, le frontend ne fait aucune hypothèse sur leur format.

## 4. Modèle de données

### User
```
id: string
name: string
email: string
createdAt: string (ISO date)
```
+ mot de passe (haché, jamais renvoyé au frontend).

### Team
```
id, name: string
dueSoonDays: number        // seuil "échéance proche" utilisé par le tableau de bord
memberCount: number
myRole: 'coordinator' | 'member'   // rôle de l'utilisateur courant dans CETTE équipe
createdAt, updatedAt: string
```

### TeamMember
```
user: User
role: 'coordinator' | 'member'
joinedAt: string
```

### Invitation
```
id: string
email: string
invitedBy: User
status: 'pending' | 'accepted' | 'expired' | 'revoked'
createdAt, expiresAt: string
```
Le mock ajoute aussi un `token` interne (pas exposé dans le modèle `Invitation` du
frontend) utilisé dans l'URL `/invitations/{token}` envoyée par email/lien.

### Board (= tableau, l'équivalent d'un "projet")
```
id, teamId, name: string
createdAt, updatedAt: string
```

### Status (= colonne Kanban)
```
id, boardId, name, color: string
position: number
isTerminal: boolean   // vrai pour la colonne "Terminé" — sert à calculer les stats
```

### Task
```
id, boardId, statusId: string
title: string
description: string | null
priority: 'faible' | 'moyenne' | 'haute' | 'critique'
dueDate: string | null
position: number
createdBy: User
assignees: User[]
labels: Label[]
commentCount: number
completedAt: string | null
createdAt, updatedAt: string
```

### Label
```
id, teamId, name, color: string
```
Unique par nom au sein d'une équipe (409 si doublon).

### Comment
```
id, taskId: string
author: User
body: string
createdAt, updatedAt: string
```

### ActivityLogEntry (fil d'activité d'une tâche, lecture seule pour le frontend —
généré automatiquement par le backend à chaque action)
```
id: string
actionType: 'task_created' | 'status_changed' | 'priority_changed' | 'assigned' |
            'unassigned' | 'label_added' | 'label_removed' | 'comment_added' |
            'member_joined' | 'member_role_changed'
user: User
metadata: objet libre (ex. { fromStatus, toStatus } pour un changement de statut)
createdAt: string
```

### Notification
```
id: string
type: 'due_date_soon' | 'status_changed' | 'comment_added' | 'assigned' | 'manual_reminder'
task: { id, title } | null
triggeredBy: User | null
message: string
isRead: boolean
createdAt: string
```

### DashboardStats (agrégat calculé, pas une table)
```
totalTasks, inProgress, completed, toStart: number
teamMembers: TeamMember[]
recentTasks: Task[]   // les 3 plus récentes
```

### TimeEntry — *nouveau, voir §6*
```
id: string
taskId, taskTitle: string
teamId: string
userId, userName: string
startedAt: string (ISO date)
endedAt: string | null        // null = chrono en cours
durationSeconds: number | null // rempli une fois le chrono arrêté
```

### TaskRecurrence — *nouveau, voir §7*
```
taskId: string
interval: number                     // "tous les X ..."
unit: 'day' | 'week' | 'month'
```
Une tâche a au plus une règle de répétition (pas de répétition = pas de ligne).

### ChecklistItem — *nouveau, voir §8*
```
id: string
taskId: string
label: string
completed: boolean
position: number
```

### TaskLink — *nouveau, voir §8*
```
id: string
taskId: string
name: string
url: string
```

### TaskNote — *nouveau, voir §8*
```
taskId: string
text: string
updatedAt: string | null   // null tant qu'aucune note n'a été enregistrée
```
Un seul texte libre par tâche (pas un fil de discussion) — au plus une ligne par
tâche, comme `TaskRecurrence`.

## 5. Liste complète des endpoints attendus

### Authentification
| Méthode | Route | Body | Réponse |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` | `{ accessToken, user }` |
| POST | `/auth/login` | `{ email, password }` | `{ accessToken, user }` |
| GET | `/auth/me` | — | `User` |

### Équipes
| Méthode | Route | Body | Réponse |
|---|---|---|---|
| GET | `/teams` | — | `Team[]` (celles de l'utilisateur courant) |
| POST | `/teams` | `{ name }` | `Team` (crée aussi le membership coordinator) |
| GET | `/teams/{id}` | — | `Team` |
| PATCH | `/teams/{id}` | `{ name?, dueSoonDays? }` | `Team` |
| DELETE | `/teams/{id}` | — | 204 |
| GET | `/teams/{id}/members` | — | `TeamMember[]` |
| PATCH | `/teams/{id}/members/{userId}` | `{ role }` | `TeamMember` |
| DELETE | `/teams/{id}/members/{userId}` | — | 204 |
| GET | `/teams/{id}/invitations` | — | `Invitation[]` |
| POST | `/teams/{id}/invitations` | `{ email }` | `Invitation` |
| PATCH | `/teams/{id}/invitations/{invitationId}` | `{ status: 'revoked' }` | `Invitation` |
| POST | `/invitations/{token}/accept` | — (auth requise) | `Team` |
| GET | `/teams/{id}/dashboard` | — | `DashboardStats` |
| GET | `/teams/{id}/active-timers` | — | `TimeEntry[]` (chronos en cours, toute l'équipe — *nouveau, voir §6*) |
| GET | `/teams/{id}/time-entries?userId=&taskId=&from=&to=` | — | `TimeEntry[]` (récap — *nouveau, voir §6*) |

### Tableaux (boards)
| Méthode | Route | Body | Réponse |
|---|---|---|---|
| GET | `/teams/{teamId}/boards` | — | `Board[]` |
| POST | `/teams/{teamId}/boards` | `{ name }` | `Board` |
| GET | `/boards/{id}` | — | `Board` |
| PATCH | `/boards/{id}` | `{ name? }` | `Board` |
| DELETE | `/boards/{id}` | — | 204 (supprime en cascade statuses + tasks) |

### Statuts (colonnes)
| Méthode | Route | Body | Réponse |
|---|---|---|---|
| GET | `/boards/{boardId}/statuses` | — | `Status[]` |
| POST | `/boards/{boardId}/statuses` | `{ name, color?, position?, isTerminal? }` | `Status` |
| PATCH | `/statuses/{id}` | `{ name?, color?, position?, isTerminal? }` | `Status` |
| DELETE | `/statuses/{id}` | — | 204 |

### Tâches
| Méthode | Route | Body | Réponse |
|---|---|---|---|
| GET | `/boards/{boardId}/tasks?statusId=&assigneeId=` | — | `Task[]` |
| POST | `/boards/{boardId}/tasks` | `{ statusId, title, description?, priority?, dueDate?, assigneeIds?, labelIds? }` | `Task` |
| GET | `/tasks/{id}` | — | `Task` |
| PATCH | `/tasks/{id}` | `{ statusId?, title?, description?, priority?, dueDate?, position? }` | `Task` |
| DELETE | `/tasks/{id}` | — | 204 |
| PUT | `/tasks/{id}/assignees` | `{ userIds }` | `Task` (remplace tous les assignés) |
| PUT | `/tasks/{id}/labels` | `{ labelIds }` | `Task` (remplace toutes les étiquettes) |
| POST | `/tasks/{id}/remind` | `{ userId, message? }` | `Notification` |
| GET | `/tasks/{id}/comments` | — | `Comment[]` |
| POST | `/tasks/{id}/comments` | `{ body }` | `Comment` |
| GET | `/tasks/{id}/activity` | — | `ActivityLogEntry[]` |
| POST | `/tasks/{id}/timer/start` | — | `TimeEntry` (*nouveau, voir §6*) |
| POST | `/tasks/{id}/timer/stop` | — | `TimeEntry` (*nouveau, voir §6*) |
| POST | `/tasks/{id}/time-entries` | `{ startedAt, endedAt }` | `TimeEntry` (saisie manuelle a posteriori — *nouveau, voir §6*) |
| PUT | `/tasks/{id}/recurrence` | `{ interval, unit }` | `TaskRecurrence` (*nouveau, voir §7*) |
| DELETE | `/tasks/{id}/recurrence` | — | 204 (*nouveau, voir §7*) |
| GET | `/tasks/{id}/checklist-items` | — | `ChecklistItem[]` (*nouveau, voir §8*) |
| POST | `/tasks/{id}/checklist-items` | `{ label }` | `ChecklistItem` (*nouveau, voir §8*) |
| PATCH | `/checklist-items/{id}` | `{ label?, completed? }` | `ChecklistItem` (*nouveau, voir §8*) |
| DELETE | `/checklist-items/{id}` | — | 204 (*nouveau, voir §8*) |
| GET | `/tasks/{id}/links` | — | `TaskLink[]` (*nouveau, voir §8*) |
| POST | `/tasks/{id}/links` | `{ name?, url }` | `TaskLink` (*nouveau, voir §8*) |
| DELETE | `/links/{id}` | — | 204 (*nouveau, voir §8*) |
| GET | `/tasks/{id}/note` | — | `TaskNote` (*nouveau, voir §8*) |
| PUT | `/tasks/{id}/note` | `{ text }` | `TaskNote` (*nouveau, voir §8*) |

`PATCH /tasks/{id}` sert aussi au drag & drop (déplacement entre colonnes) : le
frontend envoie `{ statusId, position }` — `position` est un nombre flottant utilisé
pour trier sans avoir à renuméroter toute la colonne (le frontend calcule la moyenne
entre les deux tâches voisines).

### Commentaires
| Méthode | Route | Body | Réponse |
|---|---|---|---|
| PATCH | `/comments/{id}` | `{ body }` | `Comment` |
| DELETE | `/comments/{id}` | — | 204 |

### Étiquettes (labels)
| Méthode | Route | Body | Réponse |
|---|---|---|---|
| GET | `/teams/{teamId}/labels` | — | `Label[]` |
| POST | `/teams/{teamId}/labels` | `{ name, color? }` | `Label` (409 si nom déjà pris dans l'équipe) |
| PATCH | `/labels/{id}` | `{ name?, color? }` | `Label` |
| DELETE | `/labels/{id}` | — | 204 |

### Notifications
| Méthode | Route | Body | Réponse |
|---|---|---|---|
| GET | `/notifications?unreadOnly=true\|false` | — | `Notification[]` |
| PATCH | `/notifications/{id}/read` | — | `Notification` |

Les notifications sont générées côté backend (pas créées directement par le
frontend), sauf le rappel manuel via `POST /tasks/{id}/remind`. À prévoir : générer
une notification `due_date_soon` (job planifié ou calcul à la volée), `assigned`
(quand un utilisateur est ajouté aux assignés), `comment_added`, `status_changed`.

### Historique d'activité
Généré automatiquement par le backend à chaque action pertinente sur une tâche
(création, changement de statut/priorité, (dés)assignation, ajout/retrait
d'étiquette, commentaire). Exposé en lecture via `GET /tasks/{id}/activity`.

## 6. Nouvelle fonctionnalité : suivi du temps (chrono)

Le frontend a maintenant un **chrono par tâche** (démarrer/arrêter), un indicateur de
présence ("Lucas est en train de travailler sur cette tâche" visible par les autres
utilisateurs), une page de récap du temps passé par personne/par tâche (avec export
Excel — généré entièrement côté navigateur, ne nécessite aucun endpoint), et une
**saisie manuelle a posteriori** : un bouton "Ajouter une session passée" (date +
heure de début + heure de fin) pour rattraper les oublis de chrono, qui crée
directement une entrée déjà terminée via `POST /tasks/{id}/time-entries` — à valider
côté backend comme côté frontend (`endedAt` doit être après `startedAt`).

**Cette fonctionnalité n'a pas encore de backend.** Le frontend la simule
entièrement en local (`localStorage`) pour la démo — voir
`src/app/core/services/time-tracking.service.ts` si tu veux voir exactement ce qui
est actuellement simulé (le commentaire en tête de fichier l'explique).

Le détail de ce qu'il faut développer côté backend — pour cette fonctionnalité comme
pour tout le reste de l'API listée en §5 — est dans :
- `02-backend-python-guide-complet.md` si vous partez sur Python
- `03-backend-php-guide-complet.md` si vous partez sur PHP

Une fois les endpoints `/tasks/{id}/timer/start|stop`, `/tasks/{id}/time-entries` et
`/teams/{id}/active-timers` prêts, le frontend remplacera le mock localStorage par
de vrais appels HTTP (le reste de l'UI — bouton chrono, badge de présence, page de
récap, export Excel — ne change pas ; l'export reste 100% frontend).

## 7. Nouvelle fonctionnalité : répétition de tâches (rappel tous les X jours)

Le frontend permet de définir sur une tâche une règle "tous les X jours/semaines/mois"
et affiche la prochaine occurrence calculée. **Cette partie-là (l'UI, le calcul de
date) est déjà faite côté frontend et mockée en `localStorage`** — voir
`src/app/core/services/task-recurrence.service.ts` et
`src/app/shared/utils/recurrence.util.ts` pour l'algorithme exact.

**Ce qui manque et qui doit venir du backend :** que ça se déclenche vraiment, même
quand personne n'a l'application ouverte. Contrairement à toutes les autres
fonctionnalités listées dans ce document, ça ne peut pas être un simple endpoint
REST appelé par le frontend — il faut un **job planifié côté serveur** (cron, tâche
planifiée) qui tourne en autonomie (ex. une fois par jour) et déclenche le rappel au
bon moment. Le détail (schéma de la table, algorithme du job, exemple de script) est
dans `02-backend-python-guide-complet.md` / `03-backend-php-guide-complet.md`.

Une fois ce job en place, le comportement recommandé est : générer une
`Notification` (nouveau type `recurrence_due`) pour les assignés de la tâche à
chaque occurrence — en réutilisant le système de notifications déjà décrit en §5,
pas un nouveau canal. Créer automatiquement une nouvelle tâche à chaque cycle (plutôt
qu'un simple rappel) est une extension possible, mais n'est pas ce qui a été demandé
ici — à ne faire que si le besoin se confirme.

## 8. Nouvelles fonctionnalités : to-do list, liens, notes

Trois petits ajouts au détail d'une tâche, tous du CRUD simple (contrairement au
suivi du temps ou à la répétition, pas de règle métier particulière ni de job
planifié) :

- **To-do list** (`ChecklistItem`) : une liste d'éléments cochables par tâche, avec
  une barre de progression affichée à la fois sur la carte du tableau Kanban et dans
  le détail de la tâche (ex. 3/5 cochés → barre à 60%). Mocké dans
  `src/app/core/services/checklist.service.ts`.
- **Liens** (`TaskLink`) : une liste de liens cliquables par tâche (libellé + URL),
  affichés en puces qui ouvrent dans un nouvel onglet. Si l'URL ne commence pas par
  `http`, le frontend préfixe `https://` avant l'enregistrement — reproduire cette
  normalisation côté backend si vous voulez rester cohérent en cas d'appel direct à
  l'API (Postman, script...). Mocké dans
  `src/app/core/services/task-link.service.ts`.
- **Notes** (`TaskNote`) : un unique champ de texte libre par tâche (comme la
  Description, pas un fil de discussion), avec auto-affichage d'un bouton
  "Enregistrer" quand le texte change. Mocké dans
  `src/app/core/services/task-note.service.ts`.

Ces trois services suivent le même commentaire d'en-tête que
`time-tracking.service.ts` expliquant ce qui est simulé — utile en cas de doute sur
le comportement exact attendu. Une fois les endpoints ci-dessus prêts, le frontend
remplace le mock `localStorage` par de vrais appels `HttpClient`, sans changement
d'UI.
