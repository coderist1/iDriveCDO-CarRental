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

Test card: `4242 4242 4242 4242`, any future MM/YY, any 3-digit CVV.
