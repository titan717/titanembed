# Blueprint gaps

| ID | Gap | Choice | Status |
| --- | --- | --- | --- |
| G-01 | The Mobile blueprint has no player screens. | Player B follows the Mobile blueprint's type, colour and sheet styles and the mission's gesture list. | Open — re-check each release |
| G-02 | Blueprint #7 "Another TV" is behind a Google sign-in. | Ignored until readable. | Open — retried each release |
| G-03 | Blueprints #5 and #6 are identical. | Treated as one file. | Closed |
| G-04 | No play/pause buttons on the TV control bar. | OK toggles play/pause (mission), media keys work; no extra buttons added. | Closed (follows blueprint) |
| G-05 | Mission asks for ≥28 px body text; the blueprint control text is smaller (20 tu pills, 18 tu time). | Blueprint wins for Player A (D-011); state screens and panels use 24–32 tu. | Closed |
| G-06 | No Settings screen in the TV PLAYER file. | A gear pill (icon only) opens Speed, Sleep timer, Auto-skip and Caption style, styled like the Quality panel. | Closed (addition) |
| G-07 | No error, offline, resume or ended screens in the blueprints. | Built from the Panda state-screen sizes (A31) on black. | Closed |
| G-08 | "Report an Issue" has no follow-up screen. | It opens a list of issue types; choosing one sends a `report` event to the host and shows a toast. | Closed |
