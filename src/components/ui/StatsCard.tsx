interface StatsCardProps {
  label: string;
  value: number | string;
  icon: string;
  change?: string;
  color?: string;
}

export default function StatsCard({ label, value, icon, change, color = 'bg-blue-50 dark:bg-blue-900/20' }: StatsCardProps) {
  return (
    <div className={`${color} rounded-xl p-5 border border-gray-200/50 dark:border-gray-700/50`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {change && (
          <span className="text-xs font-medium text-green-600 dark:text-green-400">{change}</span>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{label}</div>
    </div>
  );
}
