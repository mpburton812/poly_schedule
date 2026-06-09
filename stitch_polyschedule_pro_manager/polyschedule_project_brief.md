# Project Brief: PolySchedule

## 1. Product Vision & Goals
PolySchedule is a high-fidelity Progressive Web App (PWA) designed specifically for polyamorous circles to manage complex, multi-person schedules. It bridges the gap between traditional calendar apps and the nuanced logistical needs of polyamory, focusing on asynchronous coordination and clear visual hierarchy.

### Key Objectives
*   **Centralized Coordination:** Serve as the source of truth for both social events and sleeping arrangements.
*   **Asynchronous Proposal System:** Replace fragmented messaging with a structured "propose-review-confirm" workflow.
*   **Google Calendar Integration:** Use Google Calendar as a robust, universal back-end while providing a tailored front-end experience.
*   **Conflict Resolution:** Proactively identify scheduling overlaps and preference violations (e.g., sleeping night quotas) before they cause friction.

---

## 2. Target Audience
*   **Poly Circles:** Groups of partners managing shared residences and time.
*   **Administrators:** Users responsible for managing "Homes," "Rooms," and system-level logistics.
*   **External Partners:** Individuals not using the app whose schedules are managed by active users.

---

## 3. Core Features & Functional Requirements

### 3.1. Schedule Visualization
*   **Unified Weekly View:** A graphical timeline displaying "Events" and "Sleeping Arrangements."
*   **Distinct Categorization:** Visual separation (color/iconography) between social events and overnight logistics.
*   **Participant Context:** Quick-view avatars to see who is involved in any given slot.

### 3.2. Asynchronous Proposal System
*   **Creation Flow:** Define event/sleeping type, participants, date, duration, and location.
*   **Schedule Context Preview:** View the proposed time in the context of the current week's schedule before sending.
*   **Voting & Comments:** Participants can "Accept" or "Reject" with optional comments.
*   **Status Tracking:** A central hub to monitor Pending, Reviewed, and Completed proposals.
*   **Notification Integration:** Integration with phone system notifications for new proposals and responses.

### 3.3. Logistics & Configuration
*   **Residence Management:** Define multiple "Homes" and specific "Bedrooms" within them.
*   **Partner Logistics:** Set per-partner rules (e.g., minimum 3 nights/week, maximum solo nights).
*   **Administrative Dashboard:** Manage user profiles, roles (Admin vs. User), and view system logs.

---

## 4. Technical Specifications
*   **Platform:** Mobile-first Progressive Web App (PWA).
*   **Back-end:** Google Calendar API (Read/Write/Edit).
*   **Design Standard:** Android Material Design 3 (Material You).
*   **Source Control:** GitHub (`https://github.com/mpburton812/poly_schedule.git`) using `dev`, `test`, and `main` branches.
*   **Quality Assurance:** Built-in integration and user tests updated with each feature.
*   **Logging:** Comprehensive application and user activity logging for system health and accountability.

---

## 5. Design Language
*   **Primary Brand Color:** `#e96b69` (Modern Coral).
*   **Typography:** Plus Jakarta Sans (Friendly, Modern, Highly Legible).
*   **Visual Style:** Bright, friendly, and professional. Uses rounded surfaces (8dp) and soft elevation to match Material 3 aesthetics.

---

## 6. Success Metrics
*   **Reduced Friction:** Minimal "back-and-forth" required to finalize a weekly schedule.
*   **Data Integrity:** 1:1 synchronization between app state and Google Calendar.
*   **User Retention:** High weekly active usage within the poly circle.
