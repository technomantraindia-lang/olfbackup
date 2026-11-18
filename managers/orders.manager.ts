import { OrdersModel } from "../models/v1/orders/orders.model";
import MasterManager from "./master.manager";
import { OrderStatus } from "../utils/order-status.enum";

export class OrdersManager extends MasterManager {
    private ordersModel: OrdersModel;

    constructor() {
        super();
        this.ordersModel = new OrdersModel();
        
        // bindings
        this.updateOrder = this.updateOrder.bind(this);
        this.markOrderAsCompleted = this.markOrderAsCompleted.bind(this);
        this.markOrderAsCancelled = this.markOrderAsCancelled.bind(this);
        this.markOrderAsDelivered = this.markOrderAsDelivered.bind(this);
        this.markAllPreparingOrdersAsDelivered = this.markAllPreparingOrdersAsDelivered.bind(this);
    }

    async updateOrder(orderData: any, orderId: number) {
        try {
            await this.ordersModel.updateEntity("orders", "orders_master", { id: orderId }, orderData);
        } catch (error) {
            this.logger.error(error, 'updateOrder : manager');
            throw error;
        }
    }

    async markOrderAsCompleted(orderId: number) {
        try {
            await this.ordersModel.updateEntity("orders", "orders_master", { id: orderId }, { 
                status: OrderStatus.COMPLETED, 
                completed_at: new Date() 
            });
        } catch (error) {
            this.logger.error(error, 'markOrderAsCompleted : manager');
            throw error;
        }
    }

    async markOrderAsDelivered(orderId: number) {
        try {
            const result = await this.ordersModel.updateEntity("orders", "orders_master", { id: orderId }, { 
                status: OrderStatus.ORDER_DELIVERED, 
            });
            return result;
        } catch (error) {
            this.logger.error(error, 'markOrderAsDelivered : manager');
            throw error;
        }
    }

    async markAllPreparingOrdersAsDelivered() {
        try {
            // Update all orders with status 'ORDER_PREPARING' to 'ORDER_DELIVERED'
            const result = await this.ordersModel.updateEntityWithCondition(
                "orders", 
                "orders_master", 
                { status: OrderStatus.ORDER_PREPARING, comp_id: null }, // WHERE condition
                { 
                    status: OrderStatus.ORDER_DELIVERED, 
                }
            );
            
            this.logger.info(`Updated ${result.data || 0} orders to ORDER_DELIVERED`, 'markAllPreparingOrdersAsDelivered : manager');
            
            return {
                status: 1,
                data: result || 0,
                info: `Successfully updated ${result.data || 0} orders to ORDER_DELIVERED`
            };
        } catch (error) {
            this.logger.error(error, 'markAllPreparingOrdersAsDelivered : manager');
            throw error;
        }
    }

    async markOrderAsCancelled(orderId: number, reason?: string) {
        try {
            const updateData: any = { 
                status: OrderStatus.ORDER_CANCELLED, 
                cancelled_at: new Date() 
            };
            if (reason) {
                updateData.cancellation_reason = reason;
            }
            await this.ordersModel.updateEntity("orders", "orders_master", { id: orderId }, updateData);
        } catch (error) {
            this.logger.error(error, 'markOrderAsCancelled : manager');
            throw error;
        }
    }
}