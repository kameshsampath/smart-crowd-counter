"use client";

interface ImageRow {
    NAME: string;
    FILE_NAME: string;
    CAPTION: string;
    RAW: string;
    TOTAL_ATTENDEES: number;
    RAISED_HANDS: number;
    PERCENTAGE_WITH_HANDS_UP: number;
}

interface DataTableProps {
    data: ImageRow[];
    selectedIndex: number | null;
    onRowSelect: (index: number) => void;
}

export default function DataTable({
    data,
    selectedIndex,
    onRowSelect,
}: DataTableProps) {
    if (!data.length) {
        return (
            <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
                No data available. Upload some conference photos to get started.
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b">
                            <th className="text-left px-4 py-3 font-medium text-gray-700">
                                Image
                            </th>
                            <th className="text-right px-4 py-3 font-medium text-gray-700">
                                Attendees
                            </th>
                            <th className="text-right px-4 py-3 font-medium text-gray-700">
                                Raised Hands
                            </th>
                            <th className="text-right px-4 py-3 font-medium text-gray-700">
                                Conversion %
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, idx) => (
                            <tr
                                key={row.NAME}
                                onClick={() => onRowSelect(idx)}
                                className={`border-b cursor-pointer transition-colors ${selectedIndex === idx
                                        ? "bg-blue-50 border-l-4 border-l-blue-500"
                                        : "hover:bg-gray-50"
                                    }`}
                            >
                                <td className="px-4 py-3 font-medium text-gray-900">
                                    {row.NAME}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                    {row.TOTAL_ATTENDEES ?? "-"}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                    {row.RAISED_HANDS ?? "-"}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                    {row.PERCENTAGE_WITH_HANDS_UP != null
                                        ? `${row.PERCENTAGE_WITH_HANDS_UP.toFixed(1)}%`
                                        : "-"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export type { ImageRow };
