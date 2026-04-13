<<<<<<< HEAD
# Humanitarian Relief Distribution Management System



Production-style monorepo for managing displaced families, aid categories, inventory, distribution workflows, delivery assignments, confirmations, and audit trails. The interface is **Arabic-first with RTL layout**; APIs and code remain English-first for maintainability.



## Architecture



| Layer | Stack |

|------|--------|

| **Frontend** | React 19 + TypeScript + Vite 8, Tailwind CSS 3, TanStack Query, React Router 7, Axios, Zod-ready forms, Sonner toasts, Recharts |

| **Backend** | NestJS 10, Prisma 5, **PostgreSQL**, JWT access tokens + rotating refresh tokens (hashed in DB + HttpOnly cookie), RBAC guards |

| **Auth** | `Authorization: Bearer` for access; `/auth/refresh` rotates refresh cookie; password change revokes refresh sessions |

| **Data** | Relational model: users/roles/regions, beneficiaries + needs + timeline, aid categories + items, stock + movements, distributions + line items linked to stock, delivery assignment history, audit log (`Json` / JSONB details) |



### Role dashboards



- **Super Admin**: global KPIs, user lifecycle (Admin/Delivery), full data visibility, audit log.

- **Admin**: operational KPIs, beneficiaries, categories, stock adjustments, distribution creation/assignment/cancel, audit log (read).

- **Delivery**: assigned distributions only; start delivery (`OUT_FOR_DELIVERY`); complete delivery with note (stock deduction + beneficiary timeline + audit).



### Core workflows



1. **Aid request / distribution**: Admin creates `DistributionRecord` in `PENDING` with line items (`stockItemId`, `aidCategoryId`, optional `aidCategoryItemId`, `quantityPlanned`). Stock availability is validated against `quantityOnHand - quantityReserved`.

2. **Assignment**: Moving to `ASSIGNED` selects a delivery user, creates a `DeliveryAssignment` row, timestamps `assignedAt`, and **reserves** inventory (`quantityReserved` + `StockMovement` `RESERVE`).

3. **Field delivery**: Delivery marks `OUT_FOR_DELIVERY`, then completes from `OUT_FOR_DELIVERY` → `DELIVERED`, capturing proof notes, decrementing `quantityOnHand`, releasing reservations, writing `DELIVERY_OUT` movements, updating beneficiary timeline, and logging audit events.

4. **Cancellation**: Admin can cancel non-terminal distributions; reservations are released automatically.



### Export



- `GET /beneficiaries/export/csv` (JWT) streams UTF-8 CSV with BOM for Excel compatibility.



## Repository layout



```

managesystem/

  docker-compose.yml   Optional local PostgreSQL (Docker)

  package.json         Root scripts (dev / build / typecheck / docker:db)

  backend/             NestJS API + Prisma schema, migrations, seed

  frontend/            Vite React client

  DEPLOYMENT.md        Production hosting (API, UI, Postgres)

  README.md            (this file)

```



From the **repo root**:



- `npm run dev` — Vite frontend (`frontend/`)

- `npm run start:dev` or `npm run dev:api` — Nest API (`backend/`, needs `.env` + **PostgreSQL**)

- `npm run build` — build frontend then backend

- `npm run typecheck:frontend` — `tsc -b` in `frontend/` only

- `npm run docker:db` — optional local Postgres via Docker Compose



## Prerequisites



- Node.js 20+

- **PostgreSQL** 14+ (local install, Docker from `docker-compose.yml`, or managed Neon / Supabase / Railway, etc.)

**Windows PowerShell:** chaining with `&&` often fails (older PS). Run commands on separate lines, or use `;` instead (e.g. `npm install --prefix backend; npm install --prefix frontend`). From the repo root you can also run `npm run install:all`.

## Backend setup



```bash

# Optional: local Postgres

docker compose up -d



cd backend

cp .env.example .env

# edit DATABASE_URL and JWT secrets



npm install

npx prisma migrate dev

npm run prisma:seed

npm run start:dev

```



**Production-style migrate** (empty DB, CI, or managed Postgres):



```bash

cd backend

npm ci

npm run prisma:migrate:deploy

npm run prisma:seed

npm run start:prod

```



API listens on `PORT` (default `3000`). See `DEPLOYMENT.md` for split hosting.



### Seed (production-style wipe + single super-admin)



`npm run prisma:seed` (from `backend/`) **deletes all application data** (beneficiaries, stock, distributions, categories, users, regions, audit logs, etc.), keeps **roles** only, then creates **one** super-admin account.



| Login (username) | Password (default) | Display name | Role |

|------------------|---------------------|--------------|------|

| `alihmdn` | `Alihamdan772003` | ali hamda | Super Admin |



Override defaults via `backend/.env`: `SEED_SUPERADMIN_USERNAME`, `SEED_SUPERADMIN_DISPLAY_NAME`, `SEED_SUPERADMIN_PASSWORD`, optional `SEED_SUPERADMIN_EMAIL`. **Do not run seed on production** unless you intend to wipe the database.



> **Security:** Do not commit real `.env` files. Rotate the super admin password after first deploy.



### If `npx prisma migrate` fails with **P1000** (PostgreSQL auth failed)



Edit `DATABASE_URL` in `backend/.env` to match your user, password, database, and host. URL-encode special characters in the password.



## Frontend setup



```bash

cd frontend

cp .env.example .env

# set VITE_API_URL=http://localhost:3000 (or your deployed API URL)



npm install

npm run dev

```



Open `http://localhost:5173`, sign in, and use `/app/dashboard` (widgets adapt per role).



## Environment variables



**Backend** — see `backend/.env.example` and `DEPLOYMENT.md`.



**Frontend `.env`**



- `VITE_API_URL` — API origin, e.g. `http://localhost:3000`



## Security notes



- No self-registration: accounts are created by Super Admins via `/users`.

- Refresh tokens are hashed at rest; rotation reduces replay risk.

- Delivery users are scoped in services/controllers to their assignments.

- Use `NODE_ENV=production`, HTTPS, and correct `CORS_ORIGIN` in production.



## License



Private / UNLICENSED — configure per your organization.

=======
# aid management system



## Getting started

To make it easy for you to get started with GitLab, here's a list of recommended next steps.

Already a pro? Just edit this README.md and make it your own. Want to make it easy? [Use the template at the bottom](#editing-this-readme)!

## Add your files

* [Create](https://docs.gitlab.com/user/project/repository/web_editor/#create-a-file) or [upload](https://docs.gitlab.com/user/project/repository/web_editor/#upload-a-file) files
* [Add files using the command line](https://docs.gitlab.com/topics/git/add_files/#add-files-to-a-git-repository) or push an existing Git repository with the following command:

```
cd existing_repo
git remote add origin https://gitlab.com/alihmdn040-group/aid-management-system.git
git branch -M main
git push -uf origin main
```

## Integrate with your tools

* [Set up project integrations](https://gitlab.com/alihmdn040-group/aid-management-system/-/settings/integrations)

## Collaborate with your team

* [Invite team members and collaborators](https://docs.gitlab.com/user/project/members/)
* [Create a new merge request](https://docs.gitlab.com/user/project/merge_requests/creating_merge_requests/)
* [Automatically close issues from merge requests](https://docs.gitlab.com/user/project/issues/managing_issues/#closing-issues-automatically)
* [Enable merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
* [Set auto-merge](https://docs.gitlab.com/user/project/merge_requests/auto_merge/)

## Test and Deploy

Use the built-in continuous integration in GitLab.

* [Get started with GitLab CI/CD](https://docs.gitlab.com/ci/quick_start/)
* [Analyze your code for known vulnerabilities with Static Application Security Testing (SAST)](https://docs.gitlab.com/user/application_security/sast/)
* [Deploy to Kubernetes, Amazon EC2, or Amazon ECS using Auto Deploy](https://docs.gitlab.com/topics/autodevops/requirements/)
* [Use pull-based deployments for improved Kubernetes management](https://docs.gitlab.com/user/clusters/agent/)
* [Set up protected environments](https://docs.gitlab.com/ci/environments/protected_environments/)

***

# Editing this README

When you're ready to make this README your own, just edit this file and use the handy template below (or feel free to structure it however you want - this is just a starting point!). Thanks to [makeareadme.com](https://www.makeareadme.com/) for this template.

## Suggestions for a good README

Every project is different, so consider which of these sections apply to yours. The sections used in the template are suggestions for most open source projects. Also keep in mind that while a README can be too long and detailed, too long is better than too short. If you think your README is too long, consider utilizing another form of documentation rather than cutting out information.

## Name
Choose a self-explaining name for your project.

## Description
Let people know what your project can do specifically. Provide context and add a link to any reference visitors might be unfamiliar with. A list of Features or a Background subsection can also be added here. If there are alternatives to your project, this is a good place to list differentiating factors.

## Badges
On some READMEs, you may see small images that convey metadata, such as whether or not all the tests are passing for the project. You can use Shields to add some to your README. Many services also have instructions for adding a badge.

## Visuals
Depending on what you are making, it can be a good idea to include screenshots or even a video (you'll frequently see GIFs rather than actual videos). Tools like ttygif can help, but check out Asciinema for a more sophisticated method.

## Installation
Within a particular ecosystem, there may be a common way of installing things, such as using Yarn, NuGet, or Homebrew. However, consider the possibility that whoever is reading your README is a novice and would like more guidance. Listing specific steps helps remove ambiguity and gets people to using your project as quickly as possible. If it only runs in a specific context like a particular programming language version or operating system or has dependencies that have to be installed manually, also add a Requirements subsection.

## Usage
Use examples liberally, and show the expected output if you can. It's helpful to have inline the smallest example of usage that you can demonstrate, while providing links to more sophisticated examples if they are too long to reasonably include in the README.

## Support
Tell people where they can go to for help. It can be any combination of an issue tracker, a chat room, an email address, etc.

## Roadmap
If you have ideas for releases in the future, it is a good idea to list them in the README.

## Contributing
State if you are open to contributions and what your requirements are for accepting them.

For people who want to make changes to your project, it's helpful to have some documentation on how to get started. Perhaps there is a script that they should run or some environment variables that they need to set. Make these steps explicit. These instructions could also be useful to your future self.

You can also document commands to lint the code or run tests. These steps help to ensure high code quality and reduce the likelihood that the changes inadvertently break something. Having instructions for running tests is especially helpful if it requires external setup, such as starting a Selenium server for testing in a browser.

## Authors and acknowledgment
Show your appreciation to those who have contributed to the project.

## License
For open source projects, say how it is licensed.

## Project status
If you have run out of energy or time for your project, put a note at the top of the README saying that development has slowed down or stopped completely. Someone may choose to fork your project or volunteer to step in as a maintainer or owner, allowing your project to keep going. You can also make an explicit request for maintainers.
>>>>>>> 9aa8f4d233c81d61c757cdd5650169b11a16625a
