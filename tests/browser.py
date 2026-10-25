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
LONG_NAMES = [
    "Alexandria Example", "Christopher Sample", "Jordan Test-Player",
    "Taylor Test-Player", "Robin Test-Player", "Casey Sampleplayer",
    "Morgan Exampleton", "Riley Longlastname",
]


def check_width(page):
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), "Horizontal overflow"


def check_tv(page):
    size = page.evaluate("({height:innerHeight,scroll:document.documentElement.scrollHeight})")
    if size["scroll"] > size["height"] + 1:
        page.screenshot(path=str(OUT / "tv-overflow.png"), full_page=True)
    assert size["scroll"] <= size["height"] + 1, "TV needs scrolling: " + str(size)
    check_width(page)


def check_announcement(page, number, total):
    announcement = page.locator(".round-announcement")
    expect(announcement).to_have_attribute("role", "status")
    expect(announcement).to_have_attribute("aria-live", "polite")
    expect(announcement).to_have_attribute("aria-atomic", "true")
    expect(announcement).to_contain_text(f"Round {number} of {total}.")
    expect(announcement).to_contain_text(page.locator(".question-block h1").inner_text())


def check_result_labels(page, opinion=False):
    options = page.locator(".answer-option")
    for index in range(options.count()):
        option = options.nth(index)
        accessible_label = option.get_attribute("aria-label")
        label = accessible_label or option.inner_text()
        assert option.locator(".answer-text").inner_text() in label, "Answer text missing from its accessible label"
        classes = (option.get_attribute("class") or "").split()
        if opinion:
            assert re.search(r"\d+ votes?", label, re.I), "Vote count missing from the accessible label"
            assert "Correct answer" not in label and "Not correct" not in label, "Opinion labelled as a correct answer"
            if "vote-leader" in classes and accessible_label:
                assert "Top vote" in label, "Leading vote result has no accessible label"
        else:
            if "correct" in classes or accessible_label:
                assert ("Correct answer" if "correct" in classes else "Not correct") in label, "Trivia result depends only on color"
        if "picked" in classes:
            assert "Your pick" in label, "Selected answer has no accessible label"


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
        check_announcement(host, r, 6)
        check_announcement(tv, r, 6)
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
        check_result_labels(tv, opinion=r % 3 == 0)
        check_result_labels(host, opinion=r % 3 == 0)
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
        check_result_labels(tv, opinion=True)
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


def play_features(browser, base, label, errors, outside):
    """Check new room controls and modes through independent phone sessions."""
    contexts = []

    def page_for(tv=False):
        context = browser.new_context(
            viewport={"width": 1280 if tv else 390, "height": 720 if tv else 844},
            is_mobile=not tv, has_touch=not tv, device_scale_factor=1,
        )
        contexts.append(context)
        page = context.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("request", lambda r: outside.add(r.url) if not r.url.startswith(base + "/") and not r.url.startswith("data:") else None)
        return page

    def enter_name(phone, name):
        phone.get_by_label("What should we call you?").fill(name)
        phone.get_by_role("button", name="I’m in", exact=True).click()
        phone.wait_for_url("**/play/" + code)
        check_width(phone)

    def join(name):
        phone = page_for()
        phone.goto(base + "/join?room=" + code, wait_until="networkidle")
        enter_name(phone, name)
        return phone

    def end_game(host, tv):
        host.get_by_role("button", name="End game", exact=True).click()
        confirmation = host.get_by_role("group", name="End game confirmation")
        expect(confirmation).to_be_visible()
        expect(host.get_by_role("button", name="Keep playing", exact=True)).to_be_focused()
        host.get_by_role("button", name="Keep playing", exact=True).click()
        expect(confirmation).to_have_count(0)
        expect(host.get_by_role("button", name="End game", exact=True)).to_be_focused()
        expect(tv.locator(".question-block")).to_be_visible()
        host.get_by_role("button", name="End game", exact=True).click()
        host.get_by_role("button", name="End game now", exact=True).click()

    try:
        assert len(set(LONG_NAMES)) == 8 and all(17 <= len(name) <= 18 for name in LONG_NAMES)
        host = page_for()
        host.goto(base, wait_until="networkidle")
        print(label + " feature home controls: " + str(host.locator("button").all_text_contents()), flush=True)
        host.get_by_role("button", name="Host a game").click()
        host.wait_for_url("**/host/*")
        code = host.locator(".nav-room b").inner_text()
        print(label + " feature lobby controls: " + str(host.locator("button").all_text_contents()), flush=True)
        host.get_by_role("button", name="Fact or Fiction").click()
        expect(host.locator(".category-section")).to_have_count(0)
        host.get_by_label("Rounds", exact=True).select_option("6")
        host.get_by_label("Time to answer", exact=True).select_option("40")
        host.get_by_role("checkbox").uncheck()
        host.get_by_role("link", name="Join & play").click()
        enter_name(host, LONG_NAMES[0])
        phones = [host, join(LONG_NAMES[1])]
        tv = page_for(tv=True)
        tv.goto(base + "/tv/" + code, wait_until="networkidle")
        expect(tv.locator(".player-tile:not(.empty)")).to_have_count(2)
        host.get_by_role("button", name="Let’s play").click()
        expect(tv.locator(".round-pills .eyebrow")).to_have_text("ROUND 1 / 6")
        assert set(tv.locator(".answer-text").all_text_contents()) == {"True", "False"}
        check_announcement(host, 1, 6)

        # New arrivals can watch this round but cannot cast a late answer.
        phones.extend(join(name) for name in LONG_NAMES[2:])
        expect(tv.locator(".player-tile:not(.empty)")).to_have_count(8)
        for phone in phones[2:]:
            expect(phone.locator(".late-join-banner")).to_have_attribute("role", "status")
            expect(phone.locator(".late-join-banner")).to_contain_text("Your first answer is next round")
            expect(phone.locator("button.answer-option")).to_have_count(2)
            for option in phone.locator("button.answer-option").all():
                expect(option).to_be_disabled()
            phone.reload(wait_until="networkidle")
            expect(phone.locator(".late-join-banner")).to_be_visible()
            check_width(phone)
        check_tv(tv)
        tv.screenshot(path=str(OUT / f"{label}-tv-long-names-late-join.png"), animations="disabled")
        picks = ["True", "False"]
        for phone, pick in zip(phones[:2], picks):
            phone.locator("button.answer-option").filter(has=phone.get_by_text(pick, exact=True)).click()
        expect(tv.locator(".reveal-card")).to_be_visible()
        winning = tv.locator(".answer-option.correct .answer-text").inner_text()
        scores = [1000 if pick == winning else 0 for pick in picks] + [0] * 6
        for phone, score in zip(phones, scores):
            expect(phone.locator(".round-score")).to_have_text(f"{score:,} PTS")
        for phone in phones[2:]:
            expect(phone.locator(".reveal-card")).to_contain_text("Your first round is coming up")
        check_result_labels(tv)
        check_result_labels(host)
        check_tv(tv)
        host.get_by_role("button", name="Next round", exact=True).click()
        expect(tv.locator(".round-pills .eyebrow")).to_have_text("ROUND 2 / 6")
        for phone in phones:
            expect(phone.locator(".late-join-banner")).to_have_count(0)
            check_announcement(phone, 2, 6)
            expect(phone.locator("button.answer-option").first).to_be_enabled()
            phone.locator("button.answer-option").filter(has=phone.get_by_text("True", exact=True)).click()
        expect(tv.locator(".reveal-card")).to_be_visible()
        correct = tv.locator(".answer-option.correct .answer-text").inner_text()
        scores = [score + (1000 if correct == "True" else 0) for score in scores]
        for phone, score in zip(phones, scores):
            expect(phone.locator(".round-score")).to_have_text(f"{score:,} PTS")
        check_result_labels(tv)
        host.get_by_role("button", name="Next round", exact=True).click()
        expect(tv.locator(".round-pills .eyebrow")).to_have_text("ROUND 3 / 6")
        end_game(host, tv)
        expect(tv.locator(".finished")).to_be_visible()
        expect(tv.locator(".leaderboard li")).to_have_count(8)
        for name, score in zip(LONG_NAMES, scores):
            row = tv.locator(".leaderboard li").filter(has_text=name)
            expect(row).to_contain_text(f"{score:,}")
        check_tv(tv)
        tv.screenshot(path=str(OUT / f"{label}-tv-fact-fiction-results.png"), animations="disabled")

        # All eight long names also fit the party choices and a shared award.
        host.get_by_role("button", name="One more game?").click()
        expect(tv.locator(".player-tile:not(.empty)")).to_have_count(8)
        check_tv(tv)
        host.get_by_role("button", name="Group votes").click()
        host.get_by_role("button", name="Let’s play").click()
        expect(tv.locator(".answer-text")).to_have_count(8)
        assert set(tv.locator(".answer-text").all_text_contents()) == set(LONG_NAMES)
        check_tv(tv)
        for phone, name in zip(phones, LONG_NAMES):
            phone.locator("button.answer-option").filter(has=phone.get_by_text(name, exact=True)).click()
        expect(tv.locator(".reveal-card")).to_be_visible()
        expect(tv.locator(".vote-leader")).to_have_count(8)
        expect(tv.locator(".reveal-card")).to_contain_text("8 friends share the award")
        check_result_labels(tv, opinion=True)
        check_tv(tv)
        tv.screenshot(path=str(OUT / f"{label}-tv-eight-long-names-tie.png"), animations="disabled")
        for phone in phones:
            expect(phone.locator(".round-score")).to_have_text("1 AWARDS")
            check_width(phone)
        end_game(host, tv)
        expect(tv.locator(".award-person")).to_have_count(8)
        check_tv(tv)
        tv.screenshot(path=str(OUT / f"{label}-tv-eight-long-names-awards.png"), animations="disabled")

        # Closing is explicit, can be canceled, and invalidates every room view.
        for _ in range(3):
            host.get_by_role("button", name="Close room", exact=True).click()
            confirmation = host.get_by_role("group", name="Close room confirmation")
            expect(confirmation).to_be_visible()
            expect(host.get_by_role("button", name="Keep room open", exact=True)).to_be_focused()
            host.get_by_role("button", name="Keep room open", exact=True).click()
            expect(confirmation).to_have_count(0)
            expect(host.get_by_role("button", name="Close room", exact=True)).to_be_focused()
            expect(tv.locator(".award-person")).to_have_count(8)
        host.get_by_role("button", name="Close room", exact=True).click()
        host.get_by_role("button", name="Close room now", exact=True).click()
        for page in [*phones, tv]:
            expect(page.get_by_text("The host closed this room.", exact=True)).to_be_visible()
        tv.reload(wait_until="networkidle")
        expect(tv.get_by_role("heading", name="This room is closed.", exact=True)).to_be_visible()

        # A player arriving in the final round needs the next game, not a round
        # that cannot occur. A rematch must then open that player's controls.
        host.goto(base, wait_until="networkidle")
        host.get_by_role("button", name="Host a game").click()
        host.wait_for_url("**/host/*")
        code = host.locator(".nav-room b").inner_text()
        host.get_by_role("button", name="Fact or Fiction").click()
        host.get_by_label("Rounds", exact=True).select_option("6")
        host.get_by_label("Time to answer", exact=True).select_option("40")
        host.get_by_role("checkbox").uncheck()
        host.get_by_role("link", name="Join & play").click()
        enter_name(host, LONG_NAMES[0])
        partner = phones[1]
        partner.goto(base + "/join?room=" + code, wait_until="networkidle")
        enter_name(partner, LONG_NAMES[1])
        tv.goto(base + "/tv/" + code, wait_until="networkidle")
        host.get_by_role("button", name="Let’s play").click()
        for number in range(1, 6):
            expect(host.locator(".round-pills .eyebrow")).to_have_text(f"ROUND {number} / 6")
            host.get_by_role("button", name="Close answers", exact=True).click()
            expect(tv.locator(".reveal-card")).to_be_visible()
            host.get_by_role("button", name="Next round", exact=True).click()
        expect(host.locator(".round-pills .eyebrow")).to_have_text("ROUND 6 / 6")
        arrival = phones[2]
        arrival.goto(base + "/join?room=" + code, wait_until="networkidle")
        enter_name(arrival, LONG_NAMES[2])
        expect(arrival.locator(".late-join-banner")).to_contain_text("Watch this final round, then play in the next game")
        expect(arrival.locator(".answer-status")).to_contain_text("You can play in the next game")
        expect(arrival.locator("button.answer-option").first).to_be_disabled()
        host.get_by_role("button", name="Close answers", exact=True).click()
        expect(arrival.locator(".reveal-card h2")).to_have_text("You can play in the next game.")
        host.get_by_role("button", name="Final scores", exact=True).click()
        expect(tv.locator(".finished")).to_be_visible()
        host.get_by_role("button", name="One more game?").click()
        host.get_by_role("button", name="Let’s play").click()
        expect(arrival.locator(".round-pills .eyebrow")).to_have_text("ROUND 1 / 6")
        expect(arrival.locator(".late-join-banner")).to_have_count(0)
        expect(arrival.locator("button.answer-option").first).to_be_enabled()
        arrival.locator("button.answer-option").first.click()
        expect(arrival.locator(".picked")).to_have_count(1)
        return {"engine": label, "fact_or_fiction_scoring": True,
                "late_joiners_wait_then_play": 6, "late_join_reload": True,
                "last_round_join_and_rematch": True,
                "end_confirmation_and_score_retention": True, "close_confirmation_and_room_removal": True,
                "close_confirmation_cancel_reopen_cycles": 3,
                "accessible_results_and_round_announcements": True,
                "long_names_at_720p": LONG_NAMES, "eight_way_award_tie": True}
    except Exception:
        # Save only the generated test screens and layout, never browser storage.
        for name in ("host", "tv"):
            page = locals().get(name)
            if page is None or page.is_closed():
                continue
            try:
                samples = []
                for _ in range(10):
                    samples.append(page.evaluate("""() => ({
                        scrollY, height: innerHeight,
                        scrollHeight: document.documentElement.scrollHeight,
                        activeElement: document.activeElement?.textContent,
                        buttons: [...document.querySelectorAll('.room-confirmation button')].map(button => {
                            const box = button.getBoundingClientRect();
                            return {text: button.textContent, x: box.x, y: box.y,
                                    width: box.width, height: box.height,
                                    transform: getComputedStyle(button).transform,
                                    animations: button.getAnimations().map(animation => ({
                                        playState: animation.playState,
                                        currentTime: animation.currentTime,
                                        keyframes: animation.effect.getKeyframes()
                                    }))};
                        })
                    })"""))
                    page.wait_for_timeout(100)
                (OUT / f"{label}-{name}-failure-layout.json").write_text(json.dumps(samples, indent=2), encoding="utf-8")
                page.screenshot(path=str(OUT / f"{label}-{name}-failure.png"), full_page=True, animations="disabled")
            except Exception:
                pass  # Keep the original test failure when a browser has closed.
        raise
    finally:
        for context in contexts:
            context.close()


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
                        result = play(browser, base, name, errors, outside)
                        result["new_features"] = play_features(browser, base, name, errors, outside)
                        results.append(result)
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
