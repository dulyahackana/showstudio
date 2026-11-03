# 11. A project is one show; locations and the library are shared

Status: accepted (refines [ADR 10](0010-projects-and-access.md))

**Context.** ADR 10 made a project a folder for everything: characters, environments and shows. In use, the structure was hard to follow. The same figure or attraction belongs to many shows, a physical attraction is not "in" a project, and the steps from timeline to launch were spread over separate pages (shows, fleet, operator console) with no visible order.

**Decision.** Split the workspace by what things are:

- **Locations** are physical sites. They hold the environments (attractions) and their live fleet state, visible to the whole workspace.
- **The library** holds characters and assets, shared by every environment.
- **A project is one show** (same id) aimed at one environment, with its own team. `POST /projects` creates the project and its show together, and shows cannot be created any other way. The project's pages follow its four steps: Animate, Review, Deploy, Launch. Each step shows what happens next.

Project roles and the permission matrix are unchanged. They now govern a show: who animates it, reviews it, and deploys and launches it. Library and location documents belong to no project, so only workspace roles apply to them. Stop and e-stop reset act on an environment and need the workspace operator role. The e-stop stays open to anyone signed in.

**Consequences.** The sidebar reads as the structure itself (Projects, Locations, Library, Admin), and the overview places each project in the column of the step it is waiting for. Operators must be on a show's team to deploy or launch it, which matches how show crews work. Migration 3 is forward-only: each existing show becomes its own project with the members of its old project, characters move to the library, and environments move to an "Unassigned" location until an admin places them. A database check keeps every show in a project and every environment at a location.
