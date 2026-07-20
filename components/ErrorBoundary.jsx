"use client";

import React from "react";

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null, info: null, key: 0 };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        // Log so we can inspect later in console/network
        // eslint-disable-next-line no-console
        console.error("Uncaught render error:", error, info);
        this.setState({ info });
    }

    reset = () => {
        this.setState((s) => ({ error: null, info: null, key: s.key + 1 }));
    };

    render() {
        const { error, info, key } = this.state;
        if (!error) {
            // key forces remount of children when reset is called
            return <React.Fragment key={key}>{this.props.children}</React.Fragment>;
        }

        return (
            <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
                <div className="max-w-xl w-full bg-white dark:bg-gray-900 border border-red-100 dark:border-red-800 rounded-lg p-6 shadow-lg">
                    <h3 className="text-red-600 font-bold text-lg">Something went wrong</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">An unexpected error occurred while rendering the page. This is not a login issue.</p>
                    <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded">
                        <pre className="text-xs text-red-700 dark:text-red-400 overflow-auto max-h-40">{String(error && error.stack)}</pre>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                        <button onClick={this.reset} className="bg-red-600 text-white px-4 py-2 rounded">Try again</button>
                        <button onClick={() => location.reload()} className="border border-red-600 text-red-600 px-4 py-2 rounded">Reload page</button>
                    </div>
                </div>
            </div>
        );
    }
}
