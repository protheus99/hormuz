import heapq
import time
import os

class GeographicRegion:
    def __init__(self, name, labor_index, allowed_grades, tariff):
        """
        Defines regional operational rules, labor wage indicators, and physical trade boundaries.
        """
        self.region_name = name
        self.labor_cost_index = labor_index       # Wage/Salary multiplier 
        self.exploitable_grades = allowed_grades   # Geological resource constraints
        self.infrastructure_tariff = tariff       # Local tax per barrel

class ExchangeNode:
    def __init__(self, node_name, oil_grade):
        """
        Manages localized electronic priority order queues using continuous double-auctions.
        """
        self.node_name = node_name
        self.oil_grade = oil_grade
        self.bids = []  # Max-heap (-price, quantity, agent_id)
        self.asks = []  # Min-heap (price, quantity, agent_id)
        self.last_traded_price = 75.0
        self.trade_history = []

    def submit_limit_ask(self, agent_id, price, qty):
        heapq.heappush(self.asks, (price, qty, agent_id))
        self.match_orders()

    def submit_limit_bid(self, agent_id, price, qty):
        heapq.heappush(self.bids, (-price, qty, agent_id))
        self.match_orders()

    def match_orders(self):
        while self.bids and self.asks:
            best_bid_neg_price, bid_qty, buyer = self.bids[0]
            best_bid_price = -best_bid_neg_price
            best_ask_price, ask_qty, seller = self.asks[0]

            if best_bid_price >= best_ask_price:
                # Executions clear at the resting limit order value
                trade_price = best_ask_price 
                self.last_traded_price = trade_price
                
                heapq.heappop(self.bids)
                heapq.heappop(self.asks)
                
                exec_qty = min(bid_qty, ask_qty)
                self.trade_history.append(f"Matched {exec_qty:.0f} bbls @ ${trade_price:.2f} ({buyer} -> {seller})")
            else:
                break

class Producer:
    def __init__(self, p_id, region, grade, capacity, base_cost, max_storage):
        self.producer_id = p_id
        self.region = region
        self.oil_grade = grade
        self.extraction_capacity = capacity
        self.base_extraction_cost = base_cost
        self.storage_capacity = max_storage
        self.current_storage = 0.0
        
        if self.oil_grade not in self.region.exploitable_grades:
            raise ValueError(f"Geological mismatch for {self.producer_id} in {self.region.region_name}")

    def get_actual_cost(self):
        return self.base_extraction_cost * self.region.labor_cost_index

    def extract(self):
        if self.current_storage < self.storage_capacity:
            extracted = min(self.extraction_capacity, self.storage_capacity - self.current_storage)
            self.current_storage += extracted
            return extracted
        return 0.0

class Manufacturer:
    def __init__(self, m_id, region, capacity, max_storage, tech_tier=1):
        self.manufacturer_id = m_id
        self.region = region
        self.processing_capacity = capacity
        self.crude_storage_capacity = max_storage
        self.current_crude_stock = 0.0
        self.tech_tier = tech_tier

class IntegratedConglomerate:
    def __init__(self, c_id, producer_sub, manufacturer_sub):
        self.conglomerate_id = c_id
        self.producer = producer_sub
        self.manufacturer = manufacturer_sub
        self.cash_reserves = 5000000.0
        self.private_ledger_history = []

    def run_internal_clearinghouse(self):
        # 1. Physical extraction
        extracted_vol = self.producer.extract()
        self.cash_reserves -= (extracted_vol * self.producer.get_actual_cost())
        
        # 2. Private clearing via corporate internal ledger (bypasses open exchanges)
        available_crude = self.producer.current_storage
        refinery_vacuum = self.manufacturer.crude_storage_capacity - self.manufacturer.current_crude_stock
        internal_transfer = min(available_crude, refinery_vacuum)
        
        self.producer.current_storage -= internal_transfer
        self.manufacturer.current_crude_stock += internal_transfer
        
        if internal_transfer > 0:
            self.private_ledger_history.append(f"Cleared {internal_transfer:.0f} bbls internally @ ${self.producer.get_actual_cost():.2f}/bbl")
        
        # 3. Handle asymmetric open-market spillovers
        surplus = self.producer.current_storage
        deficit = max(0.0, self.manufacturer.processing_capacity - self.manufacturer.current_crude_stock)
        return surplus, deficit

# ==========================================
# 📊 VISUALIZATION TEXT-BASED DASHBOARD GENERATOR
# ==========================================
def display_dashboard(tick, nymex, ice, dme, agents):
    print("=" * 75)
    print(f" GLOBAL ENERGY MARKET SIMULATOR (GEMS) MVP RUNNER - TICK {tick}")
    print("=" * 75)
    print(f" EXCHANGE REGISTRISTERS & TICKERS:")
    print(f"  🟢 [NYMEX (Light_Sweet)] Last Price: ${nymex.last_traded_price:.2f} | Bids Active: {len(nymex.bids)} | Asks Active: {len(nymex.asks)}")
    print(f"  🔵 [ICE   (Medium)]      Last Price: ${ice.last_traded_price:.2f} | Bids Active: {len(ice.bids)} | Asks Active: {len(ice.asks)}")
    print(f"  🔴 [DME   (Heavy_Sour)]  Last Price: ${dme.last_traded_price:.2f} | Bids Active: {len(dme.bids)} | Asks Active: {len(dme.asks)}")
    print("-" * 75)
    print(" ACTIVE REGIONAL TRANSACTION LOOPS:")
    
    all_history = nymex.trade_history + ice.trade_history + dme.trade_history
    if not all_history:
        print("  (Waiting for spread crosses...)")
    else:
        for entry in all_history[-4:]:
            print(f"  >> {entry}")
    print("=" * 75)
    print("\n")

if __name__ == '__main__':
    # 1. Setup regions
    us_permian = GeographicRegion("US_Permian", 1.15, ["Light_Sweet"], 0.50)
    north_sea = GeographicRegion("North_Sea", 1.40, ["Medium"], 2.50)
    
    # 2. Setup exchanges
    nymex = ExchangeNode("NYMEX", "Light_Sweet")
    ice = ExchangeNode("ICE", "Medium")
    dme = ExchangeNode("DME", "Heavy_Sour")
    
    # 3. Setup core entities
    boreal_shale = Producer("Boreal_Shale", us_permian, "Light_Sweet", 5000, 24.0, 10000)
    australis_well = Producer("Aust_Well_Sub", north_sea, "Medium", 6000, 22.0, 15000)
    australis_plant = Manufacturer("Aust_Plant_Sub", north_sea, 4000, 8000)
    australis_corp = IntegratedConglomerate("Australis_Integrated", australis_well, australis_plant)
    
    # 4. Trigger continuous tick runtime sequence
    for tick in range(1, 4):
        # Operational Phase
        boreal_shale.extract()
        surplus, deficit = australis_corp.run_internal_clearinghouse()
        
        # Public Order Submission Phase (Bypassing internal clearing spreads)
        nymex.submit_limit_ask(boreal_shale.producer_id, 76.50 - tick, boreal_shale.current_storage)
        nymex.submit_limit_bid("Independent_Refinery_X", 74.00 + tick, 6000)
        
        if surplus > 0:
            ice.submit_limit_ask(australis_corp.conglomerate_id, 78.00, surplus)
        ice.submit_limit_bid("Euro_Factory_Y", 80.00, 5000)
        
        # Render visual dashboard updates
        display_dashboard(tick, nymex, ice, dme, [])
        time.sleep(0.5)
