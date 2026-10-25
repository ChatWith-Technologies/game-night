"""Play real games through the UI. A temporary server never touches an existing game."""
import json
import os
import re
import socket
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results"
NAMES = ["Alex", "Sam", "Jordan", "Casey", "Taylor", "Morgan", "Riley", "Robin"]


def check_width(page):
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), "Horizontal overflow"


def check_tv(page):
    size = page.evaluate("({height:innerHeight,scroll:document.documentElement.scrollHeight})")
    if size["scroll"] > size["height"] + 1:
        page.screenshot(path=str(OUT / "tv-overflow.png"), full_page=True)
    assert size["scroll"] <= size["height"] + 1, "TV needs scrolling: " + str(size)
    check_width(page)


def play(browser, base, label, errors, outside):
    contexts = []

    def page_for(tv=False, desktop=False):
        context = browser.new_context(
            viewport={"width": 1440 if desktop else 1280 if tv else 390,
                      "height": 1000 if desktop else 720 if tv else 844},
            is_mobile=not (tv or desktop), has_touch=not (tv or desktop), device_scale_factor=1,
        )
        contexts.append(context)
        page = context.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("request", lambda r: outside.add(r.url) if not r.url.startswith(base + "/") and not r.url.startswith("data:") else None)
        return page

    def shot(page, name):
        page.screenshot(path=str(OUT / f"{label}-{name}.png"), full_page=True, animations="disabled")

    def join(name, code):
        phone = page_for()
        phone.goto(base + "/join?room=" + code, wait_until="networkidle")
        phone.get_by_label("What should we call you?").fill(name)
        phone.get_by_role("button", name="I’m in", exact=True).click()
        phone.wait_for_url("**/play/" + code)
        expect(phone.get_by_role("heading", name="Hey, " + name + ".", exact=True)).to_be_visible()
        check_width(phone)
        return phone

    home = page_for(desktop=True)
    home.goto(base, wait_until="networkidle")
    print(label + " home controls: " + str(home.locator("button").all_text_contents()[:5]), flush=True)
    expect(home.get_by_role("button", name="Host a game")).to_be_enabled()
    shot(home, "home")
    home.context.close()

    host = page_for()
    host.goto(base, wait_until="networkidle")
    host.get_by_role("button", name="Host a game").click()
    host.wait_for_url("**/host/*")
    expect(host.get_by_role("link", name="Join & play")).to_be_visible()
    code = host.locator(".nav-room b").inner_text()
    assert re.fullmatch("[A-Z]{4}", code)
    host.get_by_label("Rounds", exact=True).select_option("6")
    expect(host.get_by_label("Rounds", exact=True)).to_have_value("6")
    host.get_by_label("Time to answer", exact=True).select_option("40")
    expect(host.get_by_label("Time to answer", exact=True)).to_have_value("40")
    host.get_by_role("checkbox").uncheck()
    expect(host.get_by_role("checkbox")).not_to_be_checked()
    host.get_by_role("link", name="Join & play").click()
    host.get_by_label("What should we call you?").fill(NAMES[0])
    host.get_by_role("button", name="I’m in", exact=True).click()
    host.wait_for_url("**/play/" + code)
    phones = [host] + [join(name, code) for name in NAMES[1:5]]
    # Returning to /host must retain the player's seat and answer controls.
    host.goto(base + "/host/" + code, wait_until="networkidle")
    expect(host.locator(".nav-player")).to_contain_text(NAMES[0])
    expect(host.locator(".player-tile:not(.empty)")).to_have_count(5)

    tv = page_for(tv=True)
    tv.goto(base + "/tv", wait_until="networkidle")
    print(label + " TV entry: " + tv.locator("body").inner_text()[:600], flush=True)
    tv.get_by_label("Room code", exact=True).fill(code)
    tv.get_by_role("button", name="Show the room").click()
    expect(tv.locator(".player-tile:not(.empty)")).to_have_count(5)
    assert tv.locator(".host-controls").count() == 0
    check_tv(tv)
    shot(tv, "tv-lobby")
    host.get_by_role("button", name="Let’s play").click()
    scores = [0] * 5
    for r in range(1, 7):
        expect(host.locator(".round-pills .eyebrow")).to_have_text(f"ROUND {r} / 6")
        question = host.locator(".question-block h1").inner_text()
        for phone in phones:
            expect(phone.locator(".question-block h1")).to_have_text(question)
            expect(phone.locator("button.answer-option").first).to_be_enabled()
        expect(tv.locator(".question-block h1")).to_have_text(question)
        check_tv(tv)
        if r == 1:
            shot(tv, "tv-trivia")
            shot(host, "host-phone")
            host.get_by_role("button", name="Pause", exact=True).click()
            expect(phones[1].locator(".pause-banner")).to_be_visible()
            expect(host.locator("button.answer-option").first).to_be_disabled()
            host.get_by_role("button", name="Resume", exact=True).click()
            expect(host.locator("button.answer-option").first).to_be_enabled()
        if r == 3:
            assert set(tv.locator(".answer-text").all_text_contents()) == set(NAMES[:5])
        choices = [0, 0, 1, 1, 2] if r % 3 == 0 else [0, 1, 2, 3, 0]
        picked = []
        for i, phone in enumerate(phones):
            option = phone.locator("button.answer-option").nth(choices[i])
            picked.append(option.locator(".answer-text").inner_text())
            option.click()
            if r == 1 and i == 0:
                host.reload(wait_until="networkidle")
                expect(host.locator(".picked")).to_have_count(1)
                expect(host.locator("button.answer-option").first).to_be_disabled()
        expect(tv.locator(".reveal-card")).to_be_visible()
        winning = tv.locator(".answer-option.correct .answer-text").all_text_contents()
        if r % 3 == 0:
            assert not winning, "Opinion shown as correct"
            expect(tv.locator(".opinion-note")).to_contain_text("Opinions do not earn points")
            expect(tv.locator(".vote-leader")).to_have_count(2)
            if r == 3:
                shot(tv, "tv-awards")
        else:
            assert len(winning) == 1
        for i, phone in enumerate(phones):
            scores[i] += 1000 if picked[i] in winning else 0
            expect(phone.locator(".round-score")).to_have_text(f"{scores[i]:,} PTS")
            check_width(phone)
        check_tv(tv)
        host.get_by_role("button", name="Awards & scores" if r == 6 else "Next round").click()
    for page in [*phones, tv]:
        expect(page.locator(".party-finished .award-person")).to_have_count(5)
        for i, name in enumerate(NAMES[:5]):
            card = page.locator(".award-person").filter(has=page.get_by_role("heading", name=name, exact=True))
            expect(card.locator(".award-person-heading small")).to_contain_text(f"{scores[i]:,} trivia pts")
    check_tv(tv)
    shot(tv, "tv-results")
    host.get_by_role("button", name="One more game?").click()
    expect(host.get_by_role("button", name="Let’s play")).to_be_visible()
    phones += [join(name, code) for name in NAMES[5:]]
    expect(tv.locator(".player-tile:not(.empty)")).to_have_count(8)
    check_tv(tv)
    host.get_by_role("button", name="Group votes").click()
    expect(host.locator(".category-section")).to_have_count(0)
    host.get_by_label("Time to answer", exact=True).select_option("15")
    expect(host.get_by_label("Time to answer", exact=True)).to_have_value("15")
    host.get_by_role("button", name="Let’s play").click()
    awards = dict.fromkeys(NAMES, 0)
    for r in range(1, 7):
        expect(tv.locator(".round-pills .eyebrow")).to_have_text(f"ROUND {r} / 6")
        if r % 2:
            assert set(tv.locator(".answer-text").all_text_contents()) == set(NAMES)
            assert tv.locator(".answer-letter").all_text_contents() == list("ABCDEFGH")
        check_tv(tv)
        if r == 1:
            shot(tv, "tv-eight-players")
            expect(tv.locator(".reveal-card")).to_be_visible(timeout=20000)
            expect(tv.locator(".vote-leader")).to_have_count(0)
        else:
            for i, phone in enumerate(phones):
                expect(phone.locator(".round-pills .eyebrow")).to_have_text(f"ROUND {r} / 6")
                phone.locator("button.answer-option").nth(0 if i < 4 else 1).click()
            expect(tv.locator(".reveal-card")).to_be_visible()
            expect(tv.locator(".vote-leader")).to_have_count(2)
            if r % 2:
                for name in tv.locator(".vote-leader .answer-text").all_text_contents():
                    awards[name] += 1
        assert tv.locator(".correct").count() == 0
        for name, phone in zip(NAMES, phones):
            expect(phone.locator(".round-score")).to_have_text(f"{awards[name]} AWARDS")
            check_width(phone)
        check_tv(tv)
        host.get_by_role("button", name="Awards & scores" if r == 6 else "Next round").click()
    for page in [*phones, tv]:
        expect(page.locator(".award-person")).to_have_count(8)
        for name in NAMES:
            card = page.locator(".award-person").filter(has=page.get_by_role("heading", name=name, exact=True))
            expect(card.locator(".award-person-heading small")).to_have_text(f"{awards[name]} " + ("award" if awards[name] == 1 else "awards"))
    check_tv(tv)
    shot(tv, "tv-eight-results")
    # Exercise an actual server timer and automatic round transition.
    host.get_by_role("button", name="One more game?").click()
    host.get_by_role("checkbox").check()
    host.get_by_role("button", name="Let’s play").click()
    host.get_by_role("button", name="Close answers").click()
    expect(tv.locator(".reveal-card")).to_be_visible()
    expect(tv.locator(".round-pills .eyebrow")).to_have_text("ROUND 2 / 6", timeout=16000)
    host.get_by_role("button", name="Pause", exact=True).click()
    for context in contexts:
        context.close()
    return {"engine": label, "mixed_game_players": 5, "party_game_players": 8,
            "completed_rounds": 12, "scores": dict(zip(NAMES[:5], scores)), "awards": awards,
            "host_played": True, "host_reload": True, "tv_720p_no_scroll": True,
            "timer_and_auto_advance": True, "rematch": True}


def main():
    started = time.monotonic()
    OUT.mkdir(exist_ok=True)
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    errors, outside, results = [], set(), []
    with (OUT / "browser-server.log").open("w", encoding="utf-8") as log:
        server = subprocess.Popen(["node", "server/index.js"], cwd=ROOT,
            env={**os.environ, "PORT": str(port), "GAME_LAN_IP": "127.0.0.1"},
            stdout=log, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        try:
            for _ in range(80):
                if server.poll() is not None:
                    raise RuntimeError("Test server stopped. See test-results/browser-server.log.")
                try:
                    with urllib.request.urlopen(base + "/api/health", timeout=1) as response:
                        assert json.load(response)["app"] == "chatwith-game-night"
                    break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError("Test server did not start.")
            with sync_playwright() as p:
                for name in ("chromium", "webkit"):
                    options = {"headless": True}
                    if name == "chromium" and os.environ.get("BROWSER_CHANNEL"):
                        options["channel"] = os.environ["BROWSER_CHANNEL"]
                    browser = getattr(p, name).launch(**options)
                    try:
                        results.append(play(browser, base, name, errors, outside))
                    finally:
                        browser.close()
            assert not errors, errors
            assert not outside, outside
        finally:
            server.terminate()
            server.wait(timeout=10)
    report = {"status": "passed", "seconds": round(time.monotonic() - started, 1),
              "games": results, "browser_errors": errors, "outside_requests": sorted(outside),
              "physical_devices_tested": False}
    (OUT / "browser-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
