# Global Energy Market Simulator (GEMS): Complete MVP Specification & Architecture

This comprehensive document serves as the master specification, architectural blueprint, and core logic guide for building the **Global Energy Market Simulator (GEMS)**. It unifies the economic philosophy, agent attributes, contract frameworks, infrastructure rules, geographic layers, and process workflows required to develop a functional Python-based Agent-Based Model (ABM) Minimum Viable Product (MVP).

---

## 1. Core Logic & Design Philosophy

The foundational principle of GEMS is **Agent-Based Macroeconomics**. Instead of using top-down mathematical formulas to predict or enforce commodity prices, GEMS uses a bottom-up approach. Individual market participants (Producers, Manufacturers, Traders, and Vertically Integrated Conglomerates) are programmed with localized, rational, real-world rules and constraints. 

Global oil prices are not dictated by a static equation; they **emerge organically** from the continuous friction, matching, and order-book dynamics between these autonomous agents.

To keep the MVP code highly maintainable and clean, the physical world has been abstracted into streamlined tiers:

### 🧩 Chemical & Geographic Simplification
In reality, there are hundreds of crude oil variations. In GEMS, we condense the physical world into three distinct, universally understood chemical tiers linked to specific exchange hubs:
* **Light Sweet (Premium / NYMEX Node):** Highly fluid, low sulfur. Easiest to refine into high-value gasoline. Highly reactive to North American pipeline and storage dynamics.
* **Medium (Standard / ICE Node):** The global maritime workhorse. Highly reactive to ocean shipping rates and international geopolitical shocks.
* **Heavy Sour (Discounted / DME Node):** Dense, high sulfur. Requires complex industrial processing, making it cheap to buy at the wellhead but expensive to refine.

### ⏱️ Time-Step (Tick) Synchronicity
The simulation utilizes a **discrete-time tick model**. 
* Every tick represents a fixed window of operational time (e.g., an hour or a day). 
* Within a single tick, physical actions (extraction, refining, transport) occur *simultaneously* across the global network.
* Financial actions (order placement, matching) occur *sequentially* within the electronic order books to prevent transaction collisions.

---

## 2. Core Simulation Architecture

The central hub of the ecosystem is the clearing network. It connects decentralized actors to localized physical asset grids, applies regional geographic filters, manages internal corporate structures, and matches orders via electronic priority queues.

```
                  ┌──────────────────────────────────────────────┐
                  │              GEOGRAPHIC REGION               │
                  ├──────────────────────────────────────────────┤
                  │ • Labor Cost Index (Wage Multiplier)         │
                  │ • Allowable Hydrocarbon Grades               │
                  │ • Regional Transit Grid / Pipeline Tariffs   │
                  └──────────────────────┬───────────────────────┘
                                         │
        ┌────────────────────────────────┴────────────────────────────────┐
        ▼                                                                 ▼
  [ PRODUCERS ]                 [ MIDSTREAM INFRASTRUCTURE ]       [ MANUFACTURERS ]
(Extract Grade-Specific)         (Pipelines / Tanker Fleets)   (Process Crude into Fuel)
        │                                    │                                    │
        ▼                                    ▼                                    ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                               CENTRAL CLEARING EXCHANGE                               │
│  • NYMEX Node (Light_Sweet)    • ICE Node (Medium)    • DME Node (Heavy_Sour)         │
│  • Continuous Double-Auction Matching Engine (Limit Order Books: Bids vs Asks)        │
└───────────────────────────────────────────────────────────────────────────────────────┘
        ▲                                                                 ▲
        │                                                                 │
  [ TRADERS & SPECULATORS ]                                  [ VERTICALLY INTEGRATED AGENTS ]
(Arbitrage & Liquidity Providers)                           (Bypass Exchanges / Private Ledger)
```

---

## 3. Agent Classes & Detailed Attributes

To build a fully functioning MVP simulation, each entity class must be initialized with distinct operational, financial, and physical constraints.

### 🏛️ GeographicRegion
Defines the environmental, legal, and economic rules of a specific territory (e.g., North Sea, US Permian, Western Canada).

*   `region_name` *(str)*: Unique name of the geography.
*   `labor_cost_index` *(float)*: A multiplier representing the localized salary range of energy workers (e.g., 1.35 for high-wage regions, 0.70 for low-wage regions).
*   `exploitable_grades` *(list of str)*: A geological filter defining what types of oil can physically exist here (e.g., `["Light_Sweet"]`).
*   `regional_infrastructure_tariff` *(float)*: A flat tax or pipeline transit fee applied to any barrel entering or leaving this specific geography.

### 🏛️ ExchangeNode
Manages the regional electronic order book, price discovery, and matching logic for a specific crude tier.

*   `node_name` *(str)*: Name of the hub (e.g., `"NYMEX"`, `"ICE"`, `"DME"`).
*   `oil_grade` *(str)*: Valid values: `"Light_Sweet"`, `"Medium"`, or `"Heavy_Sour"`.
*   `bids` *(list)*: A priority queue max-heap tracking buying interest `(-price, quantity, agent_id)`.
*   `asks` *(list)*: A priority queue min-heap tracking selling interest `(price, quantity, agent_id)`.
*   `last_traded_price` *(float)*: The benchmark price determined by the most recent matched transaction.

### 🛢️ Producer (Company or Sovereign Enterprise)
Represents an extraction entity. Producers inject supply into the system based on localized extraction parameters and cannot easily turn off their wells without incurring massive structural restart penalties.

*   `producer_id` *(str)*: Unique identifier.
*   `region` *(GeographicRegion)*: The physical territory where the wells are located.
*   `oil_grade` *(str)*: The primary grade extracted (`"Light_Sweet"`, `"Medium"`, or `"Heavy_Sour"`).
*   `extraction_capacity` *(float)*: Maximum barrels extracted per tick.
*   `base_extraction_cost` *(float)*: Floor dollar cost to pull one barrel from the ground before labor scaling.
*   `storage_capacity` *(float)*: Maximum physical barrels the producer can store locally at the wellhead.
*   `current_storage` *(float)*: Barrels currently sitting in local tanks.
*   `storage_cost_rate` *(float)*: Dollar maintenance fee paid per barrel per tick (e.g., \$0.05).
*   `cash_reserves` *(float)*: Liquid capital balance sheet.

### 🏗️ Manufacturer (Refinery / Factory)
Represents a crude processing network converting raw materials into consumable consumer fuel. Manufacturers operate entirely to capture profit margins between raw crudes and finished fuel products.

*   `manufacturer_id` *(str)*: Unique identifier.
*   `region` *(GeographicRegion)*: The physical territory where the processing factories are built.
*   `factory_count` *(int)*: Total operating processing facility units.
*   `processing_capacity` *(float)*: Max crude barrels consumed per factory unit per tick.
*   `tech_tier` *(int)*: 
    *   `1`: Low-tech infrastructure; can *only* process `"Light_Sweet"`.
    *   `2`: Medium infrastructure; can process `"Light_Sweet"` and `"Medium"`.
    *   `3`: High-complexity plant; can process any grade, including `"Heavy_Sour"`.
*   `product_yield` *(dict)*: Conversion breakdown ratio, e.g., `{"Gasoline": 0.60, "Diesel": 0.40}`.
*   `crude_storage_capacity` *(float)*: Maximum input warehouse capacity for raw crude.
*   `current_crude_stock` *(float)*: Active crude awaiting processing.
*   `storage_cost_rate` *(float)*: Dollar maintenance fee paid per barrel per tick.
*   `cash_reserves` *(float)*: Capital reserves to buy feedstock.

### 📊 Trader (Financial / Speculator)
Represents pure financial participants (Hedge Funds, Algorithmic Desks, or Market Makers). They have no long-term allegiance to physical assets and exist to exploit spatial and temporal inefficiencies.

*   `trader_id` *(str)*: Unique identifier.
*   `max_risk_limit` *(float)*: Maximum capital size allowed for any single trade positioning.
*   `net_open_position` *(int)*: Net contracts active inside the exchange layer (Positive = Long, Negative = Short).
*   `cash_reserves` *(float)*: Liquid trading capital.

### 🚚 LogisticsAsset (Midstream Transportation Network)
Represents physical infrastructure leased or owned by Producers, Manufacturers, Traders, or independent Third-Party Freight operators. Logistics assets bound financial actions by real-world physical transmission speeds.

*   `asset_id` *(str)*: Unique identifier.
*   `owner_id` *(str)*: Associated parent agent ID.
*   `asset_type` *(str)*: `"Pipeline"` (continuous local fluid flow) or `"Tanker"` (discrete global batch travel).
*   `origin_node` *(str)*: Origin exchange hub or production wellhead.
*   `destination_node` *(str)*: Target exchange hub or factory plant.
*   `capacity_limit` *(float)*: 
    *   *Pipelines:* Maximum continuous flow rate permitted per tick.
    *   *Tankers:* Maximum absolute cargo volume per ship voyage.
*   `freight_cost_rate` *(float)*: Flat operational fee applied per unit volume shipped.
*   `transit_timer` *(int)*: *Tankers only.* Ticks remaining until arrival at destination.

---

## 4. Rules of Vertically Integrated Agents

Vertically Integrated Agents represent giant conglomerate entities that own and operate multiple segments of the supply chain simultaneously (e.g., owning both Producer and Manufacturer assets). They interact with the simulation according to a unique set of behavioral rules:

### Rule 1: The Internal Clearinghouse (The Private Ledger)
Every simulation tick, before public market order submission begins, the integrated parent company triggers an internal synchronization sequence. 
* If its upstream extraction wells produce an output volume that matches or intersects with the raw feedstock requirements of its downstream refineries, the volume is **cleared internally via a private ledger**.
* These barrels bypass the public exchange order books entirely, occurring at exact baseline extraction cost.
* By doing this, the integrated entity completely avoids exchange clearing spreads, public broker fees, and localized transaction commissions, dramatically expanding its corporate profit margins over pure-play competitors.

### Rule 2: Exemption from Infrastructure Tariffs
If the integrated parent utilizes its own dedicated midstream assets (e.g., a private pipeline connecting its own fields directly to its own coastal refining hubs), the simulator strips the `infrastructure_tariff` property to **`0.00`** for that internal route. They remain structurally immune to the localized logistics and policy shocks that penalize pure-play trading desks.

### Rule 3: Asymmetric Public Spillover Management
An integrated firm rarely operates in a state of perfect structural equilibrium. Supply and demand imbalances are handled dynamically via an automated public market fallback filter:
* **Excess Supply (Spillover Seller):** If the internal extraction subsidiaries pump more oil than the internal refinery factories can process, the parent automatically registers as a **Seller** on the public exchange, submitting a limit ask order to liquidate the remaining surplus.
* **Supply Deficit (Spillover Buyer):** If a localized infrastructure shock or production halt starves its internal refineries of raw crude feedstock, the parent immediately pivots to act as an aggressive **Buyer** on the open exchange, throwing market bids into the matching engine to absorb third-party oil and prevent a catastrophic refinery plant shutdown.

---

## 5. Contract Framework & Market Integration

The exchange engine operates using three distinct contract structures designed to resolve specific operational mismatches between the agents:

| Contract Type | Underlying Asset | Settlement Mode | Execution Window | Primary Simulation Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Spot Contract** | Physical Raw Crude | Physical Transfer | Immediate (T+1 Ticks) | Clears immediate supply and demand mismatches. Used heavily by Producers with full storage or Manufacturers facing empty input lines. |
| **Futures Contract** | Standardized Derivative | Cash or Physical Delivery | Scaled Expiry (e.g., +100 Ticks) | Primary tool for Speculators to trade liquidity, and for Producers/Manufacturers to hedge forward price risk. |
| **Product Swap** | Refined Output Fuel | Cash Settlement | Periodic Ticks | Closed loop between Refineries and retail buyers to lock in downstream revenue margins (Gasoline/Diesel swaps). |

### 🛠️ The Crack Spread Equation (Refinery Profit Logic)
Refineries optimize their bidding behavior based on a mathematical formula called a "3-2-1 Crack Spread." For every three barrels of crude bought, they produce two barrels of gasoline and one barrel of diesel:
$$\text{Refinery Profit} = (2 \times \text{Price}_{\text{Gasoline}} + 1 \times \text{Price}_{\text{Diesel}}) - (3 \times \text{Price}_{\text{Crude}}) - \text{Operating Costs}$$
If this calculated value goes negative, Manufacturer agents will automatically reduce their factory utilization rates, lowering their bids on the crude exchanges and causing over-heated crude prices to cool off.

---

## 6. Core Process Logic Loop (Per-Tick Execution)

Every individual simulation tick executes the following operations in exact sequential order:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  1. EXTRACT  │───►│  2. INTERNAL │───►│ 3. INFRASTR. │───►│  4. ORDER    │───►│  5. MATCHING │
│  (Producers) │    │  CLEARING    │    │ (Tick Down)  │    │  SUBMISSION  │    │   (Exchange) │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

1.  **Production Phase:** `Producers` extract crude based on `extraction_capacity`. Volume is shifted into `current_storage`. Actual extraction costs are calculated dynamically by scaling baseline operations against the local `GeographicRegion.labor_cost_index`.
2.  **Internal Integration Phase:** Vertically integrated parent entities run their **Internal Clearinghouse** sequences. They match internal extraction volumes with internal refining capacity on their private ledgers at cost, moving the physical fluid directly to their refinery stock while shifting any leftover volumetric deficits or surpluses into their public market order queues.
3.  **Refinery Transformation Phase:** `Manufacturers` draw crude from `current_crude_stock`, capped by their total `processing_capacity` and filtered by `tech_tier`. Crude is converted using the `product_yield` matrix into finished products and sold immediately to an exogenous global retail sink for a cash credit. 
4.  **Infrastructure Lifecycle Phase:** Pipelines process continuous flow volumes up to their `capacity_limit`. Floating `Tanker` instances decrement their `transit_timer` by 1. Tankers hitting 0 unload their full contents directly into the target destination's inventory pool, completely returning from transit limbo.
5.  **Order Submission Phase:** Remaining unhedged independent agents evaluate internal states and send orders to the appropriate `ExchangeNode`:
    *   *Producers* list limit sells (Asks) to monetize excess storage. If storage is dangerously high, they dump via **Market Sells**.
    *   *Manufacturers* submit bids to avoid raw stock depletion.
    *   *Traders* calculate spatial price spreads (e.g., `NYMEX` vs `ICE`) and submit offsetting orders if arbitrage profit margins exceed the `freight_cost_rate`.
6.  **Matching Engine Phase:** The exchange processes orders via a continuous double-auction mechanism. Bids $\ge$ Asks execute a trade. The matching engine clears the transaction at the price of the *resting order* (the order already in the book). The `last_traded_price` is updated instantly, broadcasting a new valuation to the global network.

---

## 7. MVP Verification Metrics

When executing the Python implementation, look for the spontaneous emergence of these three real-world economic patterns to verify the structural integrity of your MVP layout:

* **The WTI-Brent Spread:** The `NYMEX` node (Light Sweet) should consistently trade at a structural premium or discount to the `ICE` node (Medium) based entirely on the freight cost assigned to the tankers connecting them.
* **The Contango Storage Trade:** If a major manufacturer shuts down for maintenance (demand drops), the spot price should plummet, prompting trader agents to immediately begin buying oil to hold in storage, expecting to sell it later when the plant reopens.
* **The Chokepoint Spike:** Artificially increasing the `transit_timer` on a maritime route (simulating a canal closure) should cause an immediate supply starvation at the destination exchange node, triggering vertical, exponential price spikes in that specific order book while leaving the origin node unaffected.

---

## 8. Expandable Development Space (Future Entrants Blueprint)

To preserve the dynamic scalability of GEMS, the software layer supports runtime registration of novel, disruptive asset types without breaking the MVP core loop:

* **🌱 Alternative Energy Entrants (Synthetic/Bio-crude):** These agents inherit the baseline `Producer` class but substitute geological extraction rules with a static `synthesis_yield` property and a high, flat `base_extraction_cost`. They remain dormant until market prices spike high enough to make bio-fuel production profitable.
* **🤖 Programmatic Market Makers (DeFi Liquidity Pools):** New automated algorithmic traders can be spawned mid-run. They bypass human behavioral cycles, using pure statistical models to post algorithmic bids and asks around the clock, testing the resilience of traditional traders.
