from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:8080/test/repro_robustness.html")

    # Wait for output
    page.wait_for_selector("#output > div")

    # Take screenshot
    page.screenshot(path="test/repro_robustness_result.png")

    # Print text content for debugging log
    print(page.locator("#output").text_content())

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
