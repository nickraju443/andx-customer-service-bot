//
//  QueueWidgetView.swift
//  ANDXSupportChat
//

import SwiftUI

struct QueueWidgetView: View {
    let theme: ANDXTheme
    let liveAgent: LiveAgentState

    var body: some View {
        HStack(spacing: 11) {
            Circle()
                .fill(dotColor)
                .frame(width: 9, height: 9)
                .shadow(color: dotColor.opacity(0.7), radius: 6)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundColor(theme.text.primary)
                Text(subtitle)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(theme.text.muted)
                    .tracking(0.5)
            }
            Spacer()
        }
        .padding(13)
        .background(theme.accent.primary.opacity(0.03))
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .strokeBorder(theme.border.strong, lineWidth: 1)
        )
        .padding(.horizontal, 20)
        .padding(.top, 10)
    }

    private var dotColor: Color {
        switch liveAgent.queueState {
        case .active: return theme.accent.online
        case .ended:  return theme.accent.alert
        default:      return theme.accent.primary
        }
    }

    private var title: String {
        switch liveAgent.queueState {
        case .queued:
            if liveAgent.isNext { return "You're next" }
            return "Position \(liveAgent.queuePosition) of \(liveAgent.queueTotal)"
        case .active:
            return "\(liveAgent.agentName ?? "Live agent") connected"
        case .ended:
            return "Chat ended"
        case .none:
            return "Connecting..."
        }
    }

    private var subtitle: String {
        switch liveAgent.queueState {
        case .queued:
            if liveAgent.isNext { return "\(liveAgent.queueTotal) IN QUEUE" }
            return "EST. WAIT ~\(liveAgent.estimatedWaitMin) MIN"
        case .active:  return "SEND A MESSAGE, AGENT WILL REPLY"
        case .ended:   return "TAP 'CHAT WITH A LIVE AGENT' TO RESTART"
        case .none:    return "REACHING SUPPORT"
        }
    }
}
