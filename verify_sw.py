from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:8080")
            page.wait_for_load_state("networkidle")
            page.wait_for_selector(".nav-title")

            # Screenshot Main Page
            page.screenshot(path="verification_sw_main.png")

            # Check console logs for SW registration (Playwright captures console?)
            page.on("console", lambda msg: print(f"Console: {msg.text}"))

            page.reload()
            page.wait_for_selector(".nav-title")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
