import { getDataBaseInstance } from '../single/db';
import { SubscriptionConfig } from '../types/definition';

export async function getSubscriptionConfig(identifier: string): Promise<any> {
    try {
        const db = await getDataBaseInstance();
        const result: SubscriptionConfig[] = await db.select(
            'SELECT config_content FROM subscription_configs WHERE identifier = ?',
            [identifier]
        );
        if (result.length === 0) {
            throw new Error('subscription_not_exist');
        }
        return JSON.parse(result[0].config_content);
    } catch (error) {
        console.error('Error getting subscription config:', error);
        throw error;
    }
}
