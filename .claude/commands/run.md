# Run Commands

## Serve locally
```bash
py -m http.server 8080
```
Open http://localhost:8080.

Opening `index.html` straight from the file system also works — there is no
server and no build — though a static server is closer to how it is published.

Note: on Windows, bare `python` is the Microsoft Store stub and hangs. Use `py`.

## Port already in use
```bash
netstat -ano | findstr :8080
taskkill /F /PID <pid>
```

## Demo accounts
All use the password `demo1234`:

| Email | Role |
|---|---|
| `admin@discoveryshop.pe` | Administrator |
| `juan@discoveryshop.pe` | Approved seller |
| `miguel@discoveryshop.pe` | Seller under review |
| `patricia@discoveryshop.pe` | Buyer |

## Resetting the data
Everything lives in `localStorage` under `discoveryshop:db:v2`. The footer link
"Reiniciar datos demo" restores the original catalog and signs you out.
