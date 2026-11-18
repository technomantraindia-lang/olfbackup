/**
 * OLS Railway Catering Platform — Neo4j Knowledge Graph Ingestion Service
 * 
 * Synchronizes domain ontology, entity relationships, and live database entities
 * (Stations, Outlets, Menus, Orders, and IRCTC Sync links) into Neo4j.
 * 
 * Usage:
 *   npx ts-node scripts/sync-knowledge-graph-neo4j.ts
 * 
 * Environment variables:
 *   NEO4J_URI=bolt://localhost:7687 (or neo4j+s://xxx.databases.neo4j.io)
 *   NEO4J_USER=neo4j
 *   NEO4J_PASSWORD=your_password
 *   NEO4J_DATABASE=neo4j (optional)
 */

import neo4j, { Driver, Session } from 'neo4j-driver';
import dotenv from 'dotenv';
import { systemDBPool } from '../database/postgres.database';
import Logger from '../utils/logger.util';

dotenv.config();

const logger = new Logger();

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || process.env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || '';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

export class Neo4jKnowledgeGraphService {
  private driver: Driver | null = null;

  constructor() {
    if (NEO4J_PASSWORD) {
      this.driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.driver) {
      logger.warn('Neo4j credentials not configured in .env (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)', 'Neo4jService');
      return false;
    }
    const session = this.driver.session({ database: NEO4J_DATABASE });
    try {
      const res = await session.run('RETURN 1 AS connected');
      const ok = res.records.length > 0;
      logger.info(`Connected to Neo4j database successfully at ${NEO4J_URI}`, 'Neo4jService');
      return ok;
    } catch (err: any) {
      logger.error(`Neo4j connection error: ${err.message}`, 'Neo4jService');
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * Initialize Schema Constraints and Domain Taxonomy in Neo4j
   */
  async initSchema(session: Session): Promise<void> {
    logger.info('Creating Neo4j uniqueness constraints...', 'Neo4jService');
    await session.run(`
      CREATE CONSTRAINT entity_id_unique IF NOT EXISTS
      FOR (n:Entity) REQUIRE n.id IS UNIQUE
    `);
    await session.run(`
      CREATE CONSTRAINT station_code_unique IF NOT EXISTS
      FOR (s:Station) REQUIRE s.code IS UNIQUE
    `);
    await session.run(`
      CREATE CONSTRAINT outlet_id_unique IF NOT EXISTS
      FOR (o:Outlet) REQUIRE o.id IS UNIQUE
    `);
    await session.run(`
      CREATE CONSTRAINT order_id_unique IF NOT EXISTS
      FOR (ord:Order) REQUIRE ord.oid IS UNIQUE
    `);
  }

  /**
   * Seed Full Ontology Model & Relationships
   */
  async seedOntology(session: Session): Promise<void> {
    logger.info('Seeding platform ontology nodes and relationships...', 'Neo4jService');

    const seedCypher = `
      // 1. Domains
      UNWIND [
        {id: 'railway', name: 'Railway Network', color: '#f59e0b'},
        {id: 'merchants', name: 'Merchants & Outlets', color: '#10b981'},
        {id: 'catalog', name: 'Menu & Food Catalog', color: '#06b6d4'},
        {id: 'orders', name: 'Orders & Dispatch', color: '#3b82f6'},
        {id: 'irctc', name: 'IRCTC Reverse Sync', color: '#8b5cf6'},
        {id: 'finance', name: 'Finance & Wallets', color: '#ec4899'},
        {id: 'hrms', name: 'HRMS & Access Control', color: '#6366f1'},
        {id: 'architecture', name: 'System Architecture', color: '#64748b'}
      ] AS d
      MERGE (dom:Domain {id: d.id})
      SET dom.name = d.name, dom.color = d.color;

      // 2. Core Entities
      UNWIND [
        {id: 'Station', domain: 'railway', schema: 'stations.stations_master'},
        {id: 'Train', domain: 'railway', schema: 'stations.trains_master'},
        {id: 'Zone', domain: 'railway', schema: 'stations.zones_master'},
        {id: 'Vendor', domain: 'merchants', schema: 'restraunts.vendor_master'},
        {id: 'Outlet', domain: 'merchants', schema: 'restraunts.restraunt_master'},
        {id: 'DeliveryBoy', domain: 'merchants', schema: 'delivery.delivery_master'},
        {id: 'DishItem', domain: 'catalog', schema: 'restraunts.dish_master'},
        {id: 'DishCategory', domain: 'catalog', schema: 'restraunts.dish_category_master'},
        {id: 'Customer', domain: 'orders', schema: 'users.customers_master'},
        {id: 'Order', domain: 'orders', schema: 'orders.orders_master'},
        {id: 'IRCTCOrderLink', domain: 'irctc', schema: 'integrations.irctc_orders'},
        {id: 'IRCTCDurableQueue', domain: 'irctc', schema: 'integrations.irctc_jobs'},
        {id: 'IRCTCSyncLogs', domain: 'irctc', schema: 'logs.irctc_sync_logs'},
        {id: 'VendorWallet', domain: 'finance', schema: 'payments.vendor_wallet'},
        {id: 'Invoice', domain: 'finance', schema: 'invoices.invoices_master'},
        {id: 'User', domain: 'hrms', schema: 'users.users_master'},
        {id: 'Role', domain: 'hrms', schema: 'auth.roles'}
      ] AS e
      MERGE (node:Entity {id: e.id})
      SET node.schema = e.schema, node.domain = e.domain
      WITH node, e
      MATCH (d:Domain {id: e.domain})
      MERGE (node)-[:BELONGS_TO_DOMAIN]->(d);
    `;

    await session.run(seedCypher);
  }

  /**
   * Sync Live Operational Data from PostgreSQL to Neo4j Graph
   */
  async syncLivePostgresData(session: Session): Promise<void> {
    logger.info('Syncing live database data into Neo4j...', 'Neo4jService');

    // 1. Sync Stations
    const stationsResult = await systemDBPool.query(`
      SELECT DISTINCT UPPER(station_code) AS code, station_name, city, state
      FROM stations.stations_master
      WHERE station_code IS NOT NULL AND TRIM(station_code) != ''
      LIMIT 200
    `);

    if (stationsResult.rows.length) {
      await session.run(`
        UNWIND $stations AS s
        MERGE (st:Station {code: s.code})
        SET st.name = s.station_name, st.city = s.city, st.state = s.state
      `, { stations: stationsResult.rows });
      logger.info(`Synced ${stationsResult.rows.length} stations to Neo4j.`, 'Neo4jService');
    }

    // 2. Sync Outlets & link to Stations
    const outletsResult = await systemDBPool.query(`
      SELECT DISTINCT ON(outlet_id) outlet_id, outlet_name, UPPER(station_code) AS station_code,
             wallet_amount, wallet_threshold, prepaid, fssai, status
      FROM restraunts.restraunt_master
      WHERE outlet_id IS NOT NULL
      ORDER BY outlet_id, (status = 1) DESC
      LIMIT 100
    `);

    if (outletsResult.rows.length) {
      await session.run(`
        UNWIND $outlets AS o
        MERGE (out:Outlet {id: toString(o.outlet_id)})
        SET out.name = o.outlet_name,
            out.wallet_amount = toFloat(o.wallet_amount),
            out.wallet_threshold = toFloat(o.wallet_threshold),
            out.prepaid = o.prepaid,
            out.fssai = o.fssai,
            out.status = o.status
        WITH out, o
        MATCH (st:Station {code: o.station_code})
        MERGE (out)-[:OPERATES_AT]->(st)
      `, { outlets: outletsResult.rows });
      logger.info(`Synced ${outletsResult.rows.length} outlets to Neo4j.`, 'Neo4jService');
    }

    // 3. Sync Recent Orders & IRCTC Sync Status
    const ordersResult = await systemDBPool.query(`
      SELECT o.oid, o.status, o.mode, o.outlet_id, UPPER(o.station_code) AS station_code,
             o.created_at, io.provider_order_id, io.sync_state
      FROM orders.orders_master o
      LEFT JOIN integrations.irctc_orders io ON o.oid = io.local_order_id
      ORDER BY o.created_at DESC
      LIMIT 100
    `);

    if (ordersResult.rows.length) {
      await session.run(`
        UNWIND $orders AS ord
        MERGE (o:Order {oid: toString(ord.oid)})
        SET o.status = ord.status,
            o.mode = ord.mode,
            o.created_at = toString(ord.created_at),
            o.provider_order_id = ord.provider_order_id,
            o.sync_state = ord.sync_state
        WITH o, ord
        MATCH (out:Outlet {id: toString(ord.outlet_id)})
        MERGE (o)-[:FULFILLED_BY]->(out)
        WITH o, ord
        MATCH (st:Station {code: ord.station_code})
        MERGE (o)-[:DELIVERED_AT]->(st)
      `, { orders: ordersResult.rows });
      logger.info(`Synced ${ordersResult.rows.length} recent orders to Neo4j.`, 'Neo4jService');
    }
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
    }
  }
}

// CLI Execution Entry Point
async function run() {
  const service = new Neo4jKnowledgeGraphService();
  const connected = await service.testConnection();

  if (!connected) {
    console.log('\n======================================================');
    console.log('Notice: Neo4j credentials not detected or unreachable.');
    console.log('To sync into a live Neo4j instance, define in your .env:');
    console.log('  NEO4J_URI=bolt://localhost:7687');
    console.log('  NEO4J_USER=neo4j');
    console.log('  NEO4J_PASSWORD=your_password');
    console.log('In the meantime, the full interactive graph is ready in:');
    console.log('  - ./knowledge-graph.html (Interactive Browser Canvas UI)');
    console.log('======================================================\n');
    process.exit(0);
  }

  const session = (service as any).driver.session({ database: NEO4J_DATABASE });
  try {
    await service.initSchema(session);
    await service.seedOntology(session);
    await service.syncLivePostgresData(session);
    console.log('\n✅ Knowledge graph successfully synchronized with Neo4j database!\n');
  } catch (err) {
    console.error('Failed to sync to Neo4j:', err);
  } finally {
    await session.close();
    await service.close();
  }
}

if (require.main === module) {
  run();
}

