export const TIMEZONE_CHOICES = [
  { name: "Eastern (ET)", value: "America/New_York" },
  { name: "Central (CT)", value: "America/Chicago" },
  { name: "Mountain (MT)", value: "America/Denver" },
  { name: "MST (Arizona)", value: "America/Phoenix" },
  { name: "Pacific (PT)", value: "America/Los_Angeles" },
  { name: "Alaska (AKT)", value: "America/Anchorage" },
  { name: "Hawaii (HT)", value: "Pacific/Honolulu" },
  { name: "Atlantic (AST)", value: "America/Puerto_Rico" },
  { name: "Newfoundland (NT)", value: "America/St_Johns" },
  { name: "London (GMT/BST)", value: "Europe/London" },
  { name: "Central Europe (CET)", value: "Europe/Berlin" },
  { name: "Eastern Europe (EET)", value: "Europe/Helsinki" },
  { name: "India (IST)", value: "Asia/Kolkata" },
  { name: "China/Singapore (CST)", value: "Asia/Shanghai" },
  { name: "Japan (JST)", value: "Asia/Tokyo" },
  { name: "Korea (KST)", value: "Asia/Seoul" },
  { name: "Australia Eastern (AET)", value: "Australia/Sydney" },
  { name: "Australia Central (ACT)", value: "Australia/Adelaide" },
  { name: "Australia Western (AWT)", value: "Australia/Perth" },
  { name: "New Zealand (NZT)", value: "Pacific/Auckland" },
] as const;

export function getTimezoneChoiceLabel(value: string): string {
  const match = TIMEZONE_CHOICES.find((choice) => choice.value === value);
  return match?.name ?? value;
}
