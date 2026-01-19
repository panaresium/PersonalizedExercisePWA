from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:8080")
            page.wait_for_load_state("networkidle")
            page.wait_for_selector(".nav-title")

            # Based on debug_error.png, we are already in "Edit Project" (New Project)
            # This happens because I likely clicked "+" in the previous script but failed later,
            # and local storage state persisted "New Project" creation?
            # Or "Create Sample" logic navigated to new project.

            # If we are in "Edit Project", let's continue the flow to create Set/Step
            if page.get_by_text("Edit Project").is_visible():
                print("In Edit Project view.")
                page.get_by_text("Add Exercise Set").click()
                # Now we should be in Project Editor still? No, "Add Exercise Set" logic in `project-editor.js`
                # adds set to state but DOES NOT navigate. It just refreshes the list.
                # So we need to click the newly created set in the list.

                # Wait for list item "New Set"
                page.wait_for_selector("text=New Set")
                page.get_by_text("New Set").first.click()

                # Now in "Edit Set"
                page.wait_for_selector("text=Edit Set")
                print("In Edit Set view.")

                page.get_by_text("Add Step").click()
                # Similarly, Add Step refreshes list.
                page.wait_for_selector("text=New Step")
                page.get_by_text("New Step").first.click()

                # Now in "Edit Step"
                page.wait_for_selector("text=Edit Step")
                print("In Edit Step view.")

                # Screenshot
                page.screenshot(path="verification_step_editor_final.png")
                print("Final screenshot taken.")
            else:
                print("Not in Edit Project view, unexpected state.")
                page.screenshot(path="debug_state.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="debug_error_final.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
