"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface DonutChartProps {
    totalAttendees: number;
    raisedHands: number;
}

const COLORS = ["#2563eb", "#f97316"];

export default function DonutChart({
    totalAttendees,
    raisedHands,
}: DonutChartProps) {
    const data = [
        { name: "Total Attendees", value: totalAttendees },
        { name: "Raised Hands", value: raisedHands },
    ];

    return (
        <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
                Attendees vs Raised Hands
            </h3>
            <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                    >
                        {data.map((_, index) => (
                            <Cell key={index} fill={COLORS[index]} />
                        ))}
                    </Pie>
                    <Tooltip />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
