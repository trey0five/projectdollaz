import { IsIn } from 'class-validator'

export type BillingPlan = 'monthly' | 'yearly'

export class CreateCheckoutDto {
  @IsIn(['monthly', 'yearly'])
  plan!: BillingPlan
}
