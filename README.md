# Elevator System Simulation – Backend API

A real-time elevator scheduling and simulation engine built using Node.js, Express, MongoDB, and WebSockets. The system assigns passenger requests using a cost-based scheduler with SCAN/LOOK movement efficiency and failsafe UX priority rules.

---

## 🧠 Scheduler Capabilities
- Cost-based scoring: distance, direction alignment, direction flip penalty, and load penalty.
- **Priority escalation** for any request waiting **> 30 seconds** (aging mechanism).
- **Morning rush bias** for Lobby (Floor 0) → Upper floor traffic between **8:30–10:30 AM**.
- **Idle elevator pre-positioning** near predicted high-traffic floors.
- Hard limits on load to prevent **overcrowding dominance**.
- Guarantee of eventual pickup to avoid starvation.

---

## 📋 Prerequisites
- **Node.js 18+**
- **MongoDB 5+**
- **npm** or **yarn**

---

## ⚙️ Installation & Setup

### 1. Clone Repository
```bash
git clone https://github.com/aryansagar/elevator_sim_be.git
cd elevator_sim_be
