# MathMaster

Výuková webová hra pro 11letého hráče: lineární rovnice, zlomky a rovnice se zlomky — zabalené ve vesmírném fantasy dobrodružství s blocky grafikou.

## Stack

- Čisté HTML/CSS/JS (ES moduly), žádný build krok, žádné externí závislosti ani CDN
- Postup se ukládá do `localStorage` (žádný backend)
- Nasazení: statické soubory za nginx + HTTPS

## Struktura

```
index.html        vstupní stránka
css/              styly (responzivní PC + tablet)
js/engine/        herní engine (save modul, stavový stroj obrazovek, herní stav)
js/content/       generátory příkladů a kroková řešení (čisté funkce)
js/ui/            UI komponenty (klávesnice, zlomkový vstup, ...)
assets/           lokální grafika a zvuky
test/             testy přes node --test
deploy/           konfigurace nasazení (nginx)
```

## Spuštění

Hra je čistě statická — stačí libovolný statický server, např.:

```bash
npx serve .        # nebo: python3 -m http.server
```

## Testy

```bash
node --test test/
```
