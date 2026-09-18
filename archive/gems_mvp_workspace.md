# Global Energy Market Simulator (GEMS) - MVP Workspace
## Project Continuation Ledger

This file serves as a persistence layer and development ledger for building the multi-market Agent-Based Model (ABM). Use this template to track code implementations, scenario stress-tests, and architectural expansions.

---

## 🛠️ Phase 1: MVP Core Engine (Python Code Construction)

Implement this structural skeleton into a local Python file (e.g., `gems_mvp.py`) to launch your core simulation logic loop.

```python
import heapq
import random

class ExchangeNode:
    def __init__(self, node_name, oil_grade):
        self.node_name = node_name
        self.oil_grade = oil_grade
        self.bids = []  # Max-heap elements stored as (-price, quantity, agent_id)
        self.asks = []  # Min-heap elements stored as (price, quantity, agent_id)
        self.last_traded_price = 75.0 if oil_grade == "Light_Sweet" else (70.0 if oil_grade == "Medium" else 62.0)

    def submit_limit_bid(self, agent_id, price, qty):
        heapq.heappush(self.bids, (-price, qty, agent_id))
        self.match_orders()

    def submit_limit_ask(self, agent_id, price, qty):
        heapq.heappush(self.asks, (price, qty, agent_id))
        self.match_orders()

    def match_orders(self):
        while self.bids and self.asks:
            highest_bid_neg_price, bid_qty, buyer = self.bids[0]
            highest_bid_price = -highest_bid_neg_price
            lowest_ask_price, ask_qty, seller = self.asks[0]

            if highest_bid_price >= lowest_ask_price:
                trade_price = lowest_ask_price  # Matched at sitting limit order price
                trade_qty = min(bid_qty, ask_qty)
                self.last_traded_price = trade_price
                
                print(f"  [EXCHANGE MATCH] Node {self.node_name}: {buyer} bought {trade_qty} bbl from {seller} at ${trade_price:.2f}")

                # Update priority queue quantities
                heapq.heappop(self.bids)
                heapq.heappop(self.asks)

                if bid_qty > trade_qty:
                    heapq.heappush(self.bids, (-highest_bid_price, bid_qty - trade_qty, buyer))
                if ask_qty > trade_qty:
                    heapq.heappush(self.asks, (lowest_ask_price, ask_qty - trade_qty, seller))
            else:
                break

class Producer:
    def __init__(self, producer_id, grade, cap, cost, max_storage):
        self.id = producer_id
        self.oil_grade = grade
        self.extraction_capacity = cap
        self.base_extraction_cost = cost
        self.storage_capacity = max_storage
        self.current_storage = 0.0
        self.cash_reserves = 100000.0
        self.storage_cost_rate = 0.05

    def step_production(self):
        if self.current_storage >= self.storage_capacity:
            print(f"  [PRODUCER FREEZE] {self.id} storage completely full. Production halted.")
            return 0
        
        actual_pump = min(self.extraction_capacity, self.storage_capacity - self.current_storage)
        self.current_storage += actual_pump
        operation_cost = actual_pump * self.base_extraction_cost + (self.current_storage * self.storage_cost_rate)
        self.cash_reserves -= operation_cost
        return actual_pump

class Manufacturer:
    def __init__(self, manufacturer_id, tier, cap, max_storage):
        self.id = manufacturer_id
        self.tech_tier = tier  # 1=Light, 2=Light/Med, 3=All
        self.processing_capacity = cap
        self.crude_storage_capacity = max_storage
        self.current_crude_stock = 100.0  # Starting raw material buffer
        self.cash_reserves = 150000.0
        self.product_yield = {"Gasoline": 0.60, "Diesel": 0.40}

    def step_refinery(self, current_product_prices):
        # Process what is available up to capacity
        input_crude = min(self.processing_capacity, self.current_crude_stock)
        self.current_crude_stock -= input_crude
        
        # Calculate market payout for products instantly cleared to consumer retail sinks
        payout = 0.0
        for product, ratio in self.product_yield.items():
            volume = input_crude * ratio
            payout += volume * current_product_prices.get(product, 95.0)
            
        self.cash_reserves += payout
        return input_crude

# --- Sample Core Loop Execution ---
if __name__ == "__main__":
    print("[INIT] Initializing Global Energy Market MVP...")
    nymex = ExchangeNode("NYMEX", "Light_Sweet")
    exxon = Producer("ExxonMobil", "Light_Sweet", cap=50, cost=40.0, max_storage=1000)
    valero = Manufacturer("Valero_Refinery", tier=1, cap=40, max_storage=800)
    
    retail_fuel_prices = {"Gasoline": 110.0, "Diesel": 105.0}

    print("
--- Running Tick 1 ---")
    exxon.step_production()
    valero.step_refinery(retail_fuel_prices)
    
    # Producer offers excess barrels to exchange
    if exxon.current_storage > 0:
        nymex.submit_limit_ask(exxon.id, price=74.50, qty=exxon.current_storage)
        exxon.current_storage = 0 # Moved conceptually onto exchange escrow
        
    # Manufacturer places bid to restock supply
    if valero.current_crude_stock < 200:
        nymex.submit_limit_bid(valero.id, price=75.00, qty=50)
```

---

## 📋 Roadmap Expansion Ledger

Track your feature builds inside this checklist as you progress from MVP to high-fidelity deployment.

### Current Implementation Milestones
- [x] Basic limit order books configured as heaps.
- [x] Streamlined chemical grades (`Light_Sweet`, `Medium`, `Heavy_Sour`).
- [x] Physical storage bounds and financial depletion tracking.

### Upcoming Implementations (Next Tasks)
- [ ] **Tanker Transit Matrix:** Create a discrete array holding `LogisticsAsset` classes that act as multi-tick timers between exchange boundaries.
- [ ] **Dynamic Logistics Pricing:** Introduce variable freight rates that increase linearly whenever the total network tanker count approaches maximum availability.
- [ ] **OPEC Behavioral Node:** Create a single umbrella agent that controls the aggregate capacity metrics of country-level state enterprises to dynamically defend an index floor price.

---

## 🧪 Simulation Stress-Test Scenarios

Document the results of structural shock tests run within your script:

1. **The Empty Book Test (Specification #4.1):** Remove all Speculator agents from the initialization matrix. Check the variance of the `bid-ask spread` across 100 continuous ticks.
2. **The Infrastructure Blockade (Specification #4.2):** Mid-run, drop a pipeline's `capacity_limit` to 0. Audit whether the corresponding Producer experiences a systemic cash crash due to holding inventory penalties.