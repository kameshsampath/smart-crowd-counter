"use client";

interface MetricsCardsProps {
    totalAttendees: number | null;
    raisedHands: number | null;
    conversionRate: number | null;
}

export default function MetricsCards({
    totalAttendees,
    raisedHands,
    conversionRate,
}: MetricsCardsProps) {
    const metrics = [
        {
            label: "Total Attendees",
            value: totalAttendees != null ? totalAttendees.toString() : "-",
            color: "text-blue-600",
        },
        {
            label: "Raised Hands",
            value: raisedHands != null ? raisedHands.toString() : "-",
            color: "text-orange-600",
        },
        {
            label: "Conversion Rate",
            value: conversionRate != null ? `${conversionRate.toFixed(1)}%` : "-",
            color: "text-green-600",
        },
    ];

    return (
        <div className="grid grid-cols-3 gap-4">
            {metrics.map((m) => (
                <div key={m.label} className="bg-white rounded-lg border p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {m.label}
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${m.color}`}>{m.value}</p>
                </div>
            ))}
        </div>
    );
}
