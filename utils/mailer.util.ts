import nodemailer from 'nodemailer';

// Gmail SMTP transporter — used for threshold warnings etc.
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_EMAIL || 'olfstores24@gmail.com',
        pass: process.env.SMTP_PASSWORD || '' 
    }
});

// Hostinger SMTP transporter — dedicated for IRCTC Order Notifications
const orderTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.ORDER_SMTP_EMAIL || 'no-reply@olfstores.com',
        pass: process.env.ORDER_SMTP_PASSWORD || ''
    }
});

interface OrderEmailData {
    vendorEmail: string;
    orderId: string;
    customerName: string;
    customerMobile: string;
    trainInfo: string;
    coachBerth: string;
    stationName: string;
    deliveryDate: string;
    orderItems: string;
    totalAmount: string | number;
    paymentType: string;
    comment: string;
}

export const sendOrderEmailToVendor = async (data: OrderEmailData) => {
    try {
        const itemsList = data.orderItems || 'N/A';

        const htmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #1a7f37 0%, #2ea043 100%); padding: 24px 32px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 22px;">🍽️ New IRCTC Order Received!</h1>
                <p style="color: #d4edda; margin: 8px 0 0; font-size: 14px;">Order #${data.orderId}</p>
            </div>
            
            <div style="padding: 24px 32px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <tr style="border-bottom: 1px solid #e1e4e8;">
                        <td style="padding: 12px 0; font-weight: 600; color: #57606a; width: 40%;">👤 Customer</td>
                        <td style="padding: 12px 0; color: #24292f;">${data.customerName}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e1e4e8;">
                        <td style="padding: 12px 0; font-weight: 600; color: #57606a;">📱 Mobile</td>
                        <td style="padding: 12px 0; color: #24292f;">${data.customerMobile}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e1e4e8;">
                        <td style="padding: 12px 0; font-weight: 600; color: #57606a;">🚂 Train</td>
                        <td style="padding: 12px 0; color: #24292f;">${data.trainInfo}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e1e4e8;">
                        <td style="padding: 12px 0; font-weight: 600; color: #57606a;">🪑 Coach/Berth</td>
                        <td style="padding: 12px 0; color: #24292f;">${data.coachBerth}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e1e4e8;">
                        <td style="padding: 12px 0; font-weight: 600; color: #57606a;">🏤 Station</td>
                        <td style="padding: 12px 0; color: #24292f;">${data.stationName}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e1e4e8;">
                        <td style="padding: 12px 0; font-weight: 600; color: #57606a;">📅 Delivery Date</td>
                        <td style="padding: 12px 0; color: #24292f;">${data.deliveryDate}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e1e4e8;">
                        <td style="padding: 12px 0; font-weight: 600; color: #57606a;">🍕 Items</td>
                        <td style="padding: 12px 0; color: #24292f;">${itemsList}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e1e4e8;">
                        <td style="padding: 12px 0; font-weight: 600; color: #57606a;">💰 Amount</td>
                        <td style="padding: 12px 0; color: #24292f; font-weight: 700; font-size: 16px;">₹${data.totalAmount}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e1e4e8;">
                        <td style="padding: 12px 0; font-weight: 600; color: #57606a;">💳 Payment</td>
                        <td style="padding: 12px 0; color: #24292f;">${data.paymentType}</td>
                    </tr>
                    ${data.comment ? `
                    <tr>
                        <td style="padding: 12px 0; font-weight: 600; color: #57606a;">📝 Comment</td>
                        <td style="padding: 12px 0; color: #24292f;">${data.comment}</td>
                    </tr>` : ''}
                </table>
            </div>

            <div style="background: #f6f8fa; padding: 16px 32px; text-align: center; font-size: 12px; color: #57606a;">
                OLF Stores — IRCTC eCatering Partner
            </div>
        </div>`;

        const mailOptions = {
            from: `"OLF Stores" <${process.env.ORDER_SMTP_EMAIL || 'no-reply@olfstores.com'}>`,
            to: data.vendorEmail,
            subject: `🍽️ New IRCTC Order #${data.orderId} Received!`,
            html: htmlContent
        };

        const info = await orderTransporter.sendMail(mailOptions);
        console.log('Order email sent to vendor:', info.messageId);
        return info;
    } catch (error: any) {
        console.error('Error sending order email to vendor:', error.message);
        // Don't throw — email failure shouldn't block order processing
    }
};

export const sendThresholdEmailToOutlet = async (
    vendorEmail: string,
    outletId: number,
    balance: number,
    threshold: number
) => {
    try {
        if (!vendorEmail) return;
        
        const htmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #d32f2f 0%, #f44336 100%); padding: 24px 32px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 22px;">⚠️ Action Required: Wallet Balance Exceeds Threshold</h1>
                <p style="color: #ffebee; margin: 8px 0 0; font-size: 14px;">Outlet #${outletId}</p>
            </div>
            
            <div style="padding: 24px 32px; color: #24292f; font-size: 14px; line-height: 1.6;">
                <p>Dear Partner,</p>
                <p>This is a notice that your current wallet balance has reached or exceeded the permitted threshold.</p>
                <div style="background: #f6f8fa; border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 4px solid #d32f2f;">
                    <p style="margin: 0 0 8px 0;"><strong>Current Balance:</strong> ₹${balance.toFixed(2)}</p>
                    <p style="margin: 0;"><strong>Allowed Threshold:</strong> ₹${threshold.toFixed(2)}</p>
                </div>
                <p style="font-weight: 600; color: #d32f2f;">Important: Your outlet will only accept Cash on Delivery (COD) orders until the balance is cleared.</p>
                <p>To restore Prepaid order capabilities, please clear the outstanding dues immediately.</p>
            </div>
            <div style="background: #f6f8fa; padding: 16px 32px; text-align: center; font-size: 12px; color: #57606a;">
                OLF Stores — IRCTC eCatering Partner
            </div>
        </div>`;

        const mailOptions = {
            from: `"OLF Stores" <${process.env.SMTP_EMAIL || 'olfstores24@gmail.com'}>`,
            to: vendorEmail,
            subject: `⚠️ Important: Wallet Balance Exceeded for Outlet #${outletId}`,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Threshold email sent to vendor:', info.messageId);
        return info;
    } catch (error: any) {
        console.error('Error sending threshold email to vendor:', error.message);
    }
};
