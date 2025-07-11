import 'dotenv/config';
import * as process from 'process';
import prisma from '../lib/prisma';

export class MetricCollector {
  /**
   * @description Start collecting metrics at regular intervals
   */
  start(): void {
    this.collectAndStore();
  }

  /**
   * @description Collect metrics and store in database
   */
  private async collectAndStore(): Promise<void> {
    try {
      const ramUsageMb = this.getRamUsage();
      const cpuUsagePercent = await this.getCpuUsage();
      const uptimeSeconds = this.getUptime();

      await prisma.systemMetric.create({
        data: {
          ram_usage_mb: ramUsageMb,
          cpu_usage_percent: cpuUsagePercent,
          uptime_seconds: uptimeSeconds,
        },
      });
    } catch (error) {
      console.error('Error collecting/storing metrics:', error);
    }
  }

  /**
   * Get RAM usage in megabytes
   */
  private getRamUsage(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.rss / 1024 / 1024); // Convert bytes to MB
  }

  /**
   * Get CPU usage percentage (async)
   */
  private async getCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();

      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const totalUsage = endUsage.user + endUsage.system;
        const percentage = (totalUsage / 1000000) * 100; // Convert microseconds to percentage
        resolve(Math.min(Math.round(percentage * 10) / 10, 100)); // Round to 1 decimal, max 100%
      }, 100);
    });
  }

  private getUptime(): number {
    return Math.floor(process.uptime());
  }

  /**
   * Get recent metrics from database
   */
  async getRecentMetrics(limit: number = 10): Promise<any[]> {
    return await prisma.systemMetric.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }
}
