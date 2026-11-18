import { Request, Response } from 'express';
import { CustomersModel } from '../../../models/v1/customers.model';

export class CustomersController {
    private customersModel = new CustomersModel();

    fetchCustomers = async (req: Request, res: Response) => {
        const result = await this.customersModel.fetch(req.query);
        return res.status(result.status === 1 ? 200 : 500).json(result);
    };
}
