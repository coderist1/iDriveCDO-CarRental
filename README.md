# iDrive CDO

Frontend-only car rental desk for Cagayan de Oro. Stack: HTML5, CSS3, JavaScript, Bootstrap.

## Open the app

**Recommended:** double-click `frontend/start-server.bat`, then open http://localhost:8080/home/index.html  
(Opening HTML files directly via `file://` can break account creation across pages in some browsers.)

Or open [`frontend/home/index.html`](frontend/home/index.html) / [`frontend/index.html`](frontend/index.html).

## Component folders

```
frontend/
  index.html                 Entry redirect
  shared/                    Shared CSS + core JS
    css/styles.css
    js/                      security, store, validation, routes, domain, ui, app
  home/                      Landing
  fleet/                     Browse + vehicle detail
  auth/                      Login, register, auth module
  booking/                   Book, trips, booking detail
  payment/                   Card payment UI
  account/                   Garage + profile
  info/                      About + contact
  admin/                     Staff/admin desk
```

Each feature folder owns its HTML and page script. Shared utilities stay under `shared/`.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@idrivecdo.ph | Drive@Admin1 |
| Staff | staff@idrivecdo.ph | Drive@Staff1 |
| Customer | guest@idrivecdo.ph | Drive@Guest1 |
| Driver | driver@idrivecdo.ph | Drive@Driver1 |

Test card: `4242 4242 4242 4242`, any future MM/YY, any 3-digit CVV.

## Docker (share the running system)

Stop `frontend/start-server.bat` first so port 8080 is free.

**On this PC (build from the frontend and backend folders):**

```bat
cd C:\dev\Frontend\iDriveCDO-CarRental
docker compose up --build -d
```

Then open http://localhost:8080

**Share with someone who only has Docker:**

1. Push images (after you are logged in to Docker Hub):
   `docker compose build` then `docker compose push`
2. Give them `docker-compose.share.yml` and a `.env` copied from `docker.env.example` (include a real `APP_KEY` and the Supabase `DB_*` values).
3. They run:

```bat
docker compose -f docker-compose.share.yml up -d
```

They open http://localhost:8080 on their machine. The website proxies `/api` and `/ml`, so they do not need the source folders.

| Container | Port |
| --- | --- |
| Website | 8080 |
| Laravel API | 8000 |
| ML API | 8001 |
