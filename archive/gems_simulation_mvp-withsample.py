import heapq

class GeographicRegion:
    def __init__(self, name, labor_index, allowed_grades, tariff):
        self.region_name = name
        self.labor_cost_index = labor_index       
        self.exploitable_grades = allowed_grades   
        self.infrastructure_tariff = tariff       

class ExchangeNode:
    def __init__(self, node_name, oil_grade):
        self.node_name = node_name
        self.oil_grade = oil_grade
        self.bids = []  
        self.asks = []  
        self.last_traded_price = 75.0

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
        extracted = min(self.extraction_capacity, self.storage_capacity - self.current_storage)
        self.current_storage += extracted
        return extracted

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

    def run_internal_clearinghouse(self):
        # 1. Pull volume from physical wells
        extracted_vol = self.producer.extract()
        self.cash_reserves -= (extracted_vol * self.producer.get_actual_cost())
        
        # 2. Clear matching volume privately on corporate balance sheet at cost
        available_crude = self.producer.current_storage
        refinery_vacuum = self.manufacturer.crude_storage_capacity - self.manufacturer.current_crude_stock
        internal_transfer = min(available_crude, refinery_vacuum)
        
        self.producer.current_storage -= internal_transfer
        self.manufacturer.current_crude_stock += internal_transfer
        
        print(f"[{self.conglomerate_id} LEDGER] Cleared {internal_transfer:.0f} bbls internally. Private Cost: ${self.producer.get_actual_cost():.2f}/bbl")
        
        # 3. Calculate public spillover market profiles
        # Overproduction spills out as open market supply (Surplus)
        surplus = self.producer.current_storage
        # Underproduction forces company to buy open market supply (Deficit)
        deficit = max(0.0, self.manufacturer.processing_capacity - self.manufacturer.current_crude_stock)
        return surplus, deficit

# ==========================================
# 🏁 INITIALIZING COMPREHENSIVE SIMULATION RUN
# ==========================================

# 1. Build Geographic Regions
us_permian    = GeographicRegion("US_Permian", labor_index=1.15, allowed_grades=["Light_Sweet"], tariff=0.50)
north_sea     = GeographicRegion("North_Sea", labor_index=1.40, allowed_grades=["Medium"], tariff=2.50)
west_canada   = GeographicRegion("Western_Canada", labor_index=1.10, allowed_grades=["Heavy_Sour"], tariff=1.80)
mid_east      = GeographicRegion("Middle_East_Desert", labor_index=0.75, allowed_grades=["Light_Sweet", "Medium", "Heavy_Sour"], tariff=0.20)
coastal_asia  = GeographicRegion("Coastal_Asia", labor_index=0.80, allowed_grades=["Light_Sweet"], tariff=1.00)

# 2. Build Independent Players
pioneer_shale = Producer("Boreal_Shale", us_permian, "Light_Sweet", capacity=6000, base_cost=24.0, max_storage=12000)
aegis_rig     = Producer("Aegis_Offshore", north_sea, "Medium", capacity=3500, base_cost=32.0, max_storage=15000)
metro_factory = Manufacturer("Metro_Refine", coastal_asia, capacity=10000, max_storage=20000, tech_tier=1)

# 3. Build Integrated Giants
# Australis Setup (Overproducer Configuration)
australis_well  = Producer("Australis_Well_Sub", north_sea, "Medium", capacity=8000, base_cost=22.0, max_storage=20000)
australis_plant = Manufacturer("Australis_Plant_Sub", north_sea, capacity=5000, max_storage=15000)
australis_corp  = IntegratedConglomerate("Australis_Integrated", australis_well, australis_plant)

# Helios Setup (Underproducer Configuration)
helios_well  = Producer("Helios_Well_Sub", mid_east, "Medium", capacity=4000, base_cost=12.0, max_storage=10000)
helios_plant = Manufacturer("Helios_Plant_Sub", mid_east, capacity=9000, max_storage=25000)
helios_corp  = IntegratedConglomerate("Helios_Integrated", helios_well, helios_plant)

# ==========================================
# 🔄 EXECUTE SINGLE TICK CYCLE EVALUATION
# ==========================================
print("\n--- TICK 1: RUNNING CONGLOMERATE PRIVATE LEDGERS ---")

# Execute Integrated Multi-Segment Transfers
aust_surplus, aust_deficit = australis_corp.run_internal_clearinghouse()
heli_surplus, heli_deficit = helios_corp.run_internal_clearinghouse()

print("\n--- TICK 1: OPEN MARKET SPILLOVER CONVERSION ---")
print(f">> Australis Spillover: Generated public market SELL order for {aust_surplus:.0f} bbls of Medium crude.")
print(f">> Helios Spillover: Generated public market BUY order for {heli_deficit:.0f} bbls of feedstock crude.")

print("\n--- TICK 1: INDEPENDENT AGENT COSTS EVALUATED ---")
print(f">> Aegis Offshore Actual Operating Wellhead Cost: ${aegis_rig.get_actual_cost():.2f}/bbl (High Wage Geography Impact)")
print(f">> Boreal Shale Actual Operating Wellhead Cost: ${pioneer_shale.get_actual_cost():.2f}/bbl (Standard Geography Impact)")
