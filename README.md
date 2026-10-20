# Blocky for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that
follows and controls [Blocky](https://github.com/0xERR0R/blocky), the
lightweight open source DNS proxy and ad blocker, through its REST API and its
Prometheus endpoint, over the local network. No cloud, no account.

> **Tested against a real Blocky v0.35.0** (the official Docker image), not yet
> with a real Gladys installation: feedback welcome in the
> [issues](https://github.com/guim31/gladys-blocky/issues).

## Features

- **One device per server** (up to three): the **blocking switch** (off: a
  5-minute pause by default, up to 60 minutes, or until turned back on, as
  configured; back on by itself at the end of a pause), and, with the
  Prometheus endpoint on, the DNS queries and blocked queries of the last hour,
  the share blocked, the cache hit rate, the blocked domains (deny list
  entries) and the version.
- **Dashboard widget** "Blocky": the figures of the last hour for every server
  (or one), the state of each server (blocking, paused with the minutes left,
  disabled, unreachable), the groups of a partial pause, the cache hit rate,
  the blocked domains, and four direct buttons: **Pause 5 min**, **Pause 30
  min**, **Pause…** (a duration typed in a form, Gladys 5.2.0 or later) and
  **Resume**.
- **Scene triggers**: _Blocky blocking paused_ (with the length of the pause,
  its groups, and whether it came from Gladys or from elsewhere), _Blocky
  blocking resumed_ (by the end of the pause, Gladys or elsewhere), _Blocky no
  longer answers_ and _Blocky answers again_.
- **Scene actions**: _Pause Blocky blocking_ (one server or all of them, for a
  number of minutes, **for some groups of deny lists or all**), _Resume Blocky
  blocking_, _Refresh the Blocky lists_, _Flush the Blocky DNS cache_, and
  _Read the Blocky statistics_ (a sentence and the figures, for a message or a
  spoken report).
- A **Test the connection** button in the Configuration screen, and a
  connection status that names the server and the problem (wrong port,
  certificate, redirect…).
- A **transport badge** per device: local, or unreachable.
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets, scene triggers and actions).
  The _Pause…_ button of the widget needs **5.2.0** (forms behind widget
  buttons); on 5.1, it answers that Gladys needs an update.
- **Blocky** with its HTTP port reachable from Gladys (`ports: http: 4000`).
  The API has no authentication.
- For the statistics: `prometheus: enable: true` in `config.yml`.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-blocky` (or
   install **Blocky** from the catalog once it is listed).
2. In **Configuration**, enter the address of your server (`192.168.1.2` gets
   port 4000; or a full URL such as `http://192.168.1.2:4000`) and a name; up
   to two more servers below. Save, then click **Test the connection**.
3. Open the **Discover** tab and add the devices.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- Every refresh interval (30 s by default, up to 5 min), each server is read
  with `GET /api/blocking/status` (`enabled`, `disabledGroups`,
  `autoEnableInSec`) and `GET /metrics`. The devices are published with
  `should_poll: false`: the interval can be beyond the list of the Gladys
  scheduler, and the scene events must fire even for a server whose device was
  not added.
- Blocky counts since it started. The integration keeps the readings of the
  last hour in memory and publishes the difference between the newest one and
  the one an hour before; a counter going down (Blocky restarted) starts the
  window again.
- Only the values that changed are sent to Gladys (`publishChangedStates` of
  the SDK), an unchanged value again every six hours, and all of them when a
  device is added or Gladys reconnects.
- A pause is `GET /api/blocking/disable?duration=Nm&groups=a,b` (no duration:
  until resumed); resume is `GET /api/blocking/enable`. A new pause replaces
  the running one in Blocky. The lists are refreshed with
  `POST /api/lists/refresh`, the cache flushed with `POST /api/cache/flush`.
- A blocking change seen within 30 s of a Gladys command is Gladys' own; any
  other is "outside Gladys", or "end of the pause" when it happens at the time
  the pause was due to end.
- A server is "down" after two failed reads in a row (the second one 15 s
  after the first), counting only silence: a wrong port is a configuration
  problem, shown in the connection status.
- Nothing is stored under `/data`. HTTP(S) runs on `node:http` /
  `node:https`: `fetch` cannot accept a self-signed certificate for one server
  only.

## Checked on a real server, and what was not

On 20/10/2026 the Docker image of the integration was built and run with the
Gladys sandbox constraints (read-only root, all capabilities dropped, 256 MB,
bridge network, no port published) next to a real Blocky v0.35.0
(`spx01/blocky`, a small inline deny list in two groups, Prometheus on) on an
isolated Docker network, with DNS queries sent by a client container:

- without Gladys, the container retries the connection calmly (no crash loop),
  with little memory at rest;
- the whole integration (with the SDK's fake Gladys) against the real server:
  discovery, states, the last hour, widget within the core budget, pause of
  one group from a scene, pause and resume from the widget, the automatic end
  of a pause, list refresh, cache flush, statistics sentence, "Test the
  connection", an unknown group, Prometheus off, a wrong port;
- the answers recorded there are the test fixtures
  (`test/fixtures/blocky/real/`).

Not checked: HTTPS on the HTTPS port of Blocky, several instances sharing
their state through Redis, Blocky versions older than 0.35 (older metric names
are read as a fallback, untested), and the widget and its _Pause…_ form in a
real Gladys.

## Limitations

- Three servers at most per Gladys.
- The statistics need the Prometheus endpoint, and cover the last hour only
  (shorter just after a start).
- The shares are rounded in the device (Gladys has no decimal percentage
  sensor); the widget shows one decimal for the share blocked.
- No management of the lists, client groups or configuration of Blocky: that
  stays in `config.yml`.
- Names ending in `.local` do not resolve inside the integration container:
  use IP addresses or names your DNS resolves.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory Blocky server (`test/helpers/fakeBlocky.js`) built from
answers of a real server (`test/fixtures/blocky/real/`). See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Blocky](https://github.com/0xERR0R/blocky) by 0xERR0R and contributors
  (Apache-2.0): its documentation and API, and its logo
  ([`docs/blocky.svg`](https://github.com/0xERR0R/blocky/blob/main/docs/blocky.svg)),
  used on the cover to say what the integration works with. No code was copied.
- [Technitium DNS for Gladys](https://github.com/guim31/gladys-technitium) and
  [Pi-hole for Gladys](https://github.com/guim31/gladys-pihole): the
  architecture, the pause buttons, triggers and actions, adapted here.
- [AdGuard Home for Gladys](https://github.com/cicoub13/gladys-adguard-home) by
  cicoub13 (Apache-2.0): the idea of the pause buttons; no code was copied.
- The conformity tests follow [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Blocky or its
authors. "Blocky" and its logo belong to their owners and are used here only
to say what the integration works with.

## License

Apache-2.0
