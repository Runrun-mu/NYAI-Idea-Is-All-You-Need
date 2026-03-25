export class CostTracker {
  private spent = 0;
  private budget: number;

  constructor(budget: number) {
    this.budget = budget;
  }

  add(cost: number): void {
    this.spent += cost;
  }

  getSpent(): number {
    return this.spent;
  }

  getBudget(): number {
    return this.budget;
  }

  isOverBudget(): boolean {
    return this.spent >= this.budget;
  }

  getRemainingBudget(): number {
    return Math.max(0, this.budget - this.spent);
  }

  getSummary(): string {
    return `$${this.spent.toFixed(4)} / $${this.budget.toFixed(2)}`;
  }
}
