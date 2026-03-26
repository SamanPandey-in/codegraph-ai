import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Wrench,
  Calendar,
  Users,
  BarChart3,
  ArrowRight,
  Shield,
  Zap,
  TrendingUp,
  Clock,
  Award
} from 'lucide-react';
import Button from '@mui/material/Button';
import ThemeToggle from '../components/theme/ThemeToggle';

const Landing = () => {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const features = [
    {
      icon: <Wrench size={24} />,
      title: 'One-Click Asset Intelligence',
      description: "Never hunt for data again. Our 'Smart Button' technology provides an instant, filtered history of every repair.",
    },
    {
      icon: <Users size={24} />,
      title: 'Team Management',
      description: 'Organize specialized teams and assign maintenance tasks efficiently.',
    },
    {
      icon: <Calendar size={24} />,
      title: 'Smart Scheduling',
      description: 'Schedule preventive maintenance and never miss critical service dates.',
    },
    {
      icon: <BarChart3 size={24} />,
      title: 'Insights & Reports',
      description: 'Get actionable insights with comprehensive maintenance analytics.',
    },
    {
      icon: <Shield size={24} />,
      title: 'Warranty Management',
      description: 'Track warranty information and ensure timely claims.',
    },
    {
      icon: <Zap size={24} />,
      title: 'Real-time Updates',
      description: 'Stay informed with instant notifications and status updates.',
    },
  ];

  const stats = [
    { value: '40%', label: 'Reduction in Downtime', icon: <TrendingUp size={24} /> },
    { value: '500+', label: 'Companies Trust Us', icon: <Users size={24} /> },
    { value: '99.9%', label: 'System Uptime', icon: <Clock size={24} /> },
    { value: '4.9/5', label: 'Customer Rating', icon: <Award size={24} /> },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      {/* Navigation */}
      <nav className="border-b fixed w-full top-0 z-50" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* logo */}
            <div className="flex items-center gap-4">
              <Link to="/login">
                <Button variant="text">Login</Button>
              </Link>
              <Link to="/signup">
                <Button variant='contained' color="primary">Get Started</Button>
              </Link>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-32" style={{ backgroundColor: 'var(--bg)' }}>
        {/* Animated background elements */}
        <div className="absolute inset-0 opacity-30" style={{ background: 'linear-gradient(to bottom right, var(--primary-50), var(--bg), var(--secondary-100))' }}></div>
        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-primary-100 rounded-full filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-1/3 h-1/3 bg-secondary-200 rounded-full filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6 shadow-sm" style={{ backgroundColor: 'var(--primary-100)', color: 'var(--primary-700)' }}>
              <Zap size={16} />
              <span>Trusted by 500+ companies worldwide</span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display font-bold mb-6 leading-tight" style={{ color: 'var(--text)' }}>
              Fix Breakdowns
              <span className="block mt-2 bg-linear-to-r from-primary-600 to-primary-800 bg-clip-text text-text">
                Before They Break You
              </span>
            </h1>

            <p className="text-xl sm:text-2xl mb-10 max-w-3xl mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Centrailze assets, automate maintainance requests, and keep teams moving with real-time visibility
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link to="/signup">
                <Button
                  size="large"
                  variant="contained"
                  className="w-full sm:w-auto shadow-lg hover:shadow-xl"
                  endIcon={<ArrowRight size={20} />}
                >
                  Start Managing Assets
                </Button>
              </Link>
              <Link to="/login">
                <Button size="large" variant="outlined" className="w-full sm:w-auto">
                  Explore Workflow
                </Button>
              </Link>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto mt-16">
              {stats.map((stat, index) => (
                <div key={index} className="rounded-xl p-6 shadow border" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                  <div className="flex justify-center mb-3" style={{ color: 'var(--primary-600)' }}>
                    {stat.icon}
                  </div>
                  <div className="text-3xl font-bold mb-1" style={{ color: 'var(--text)' }}>{stat.value}</div>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 relative" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="absolute inset-0 opacity-50" style={{ background: 'linear-gradient(to bottom, var(--card), var(--bg))' }}></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block px-4 py-2 rounded-full text-sm font-semibold mb-4 dark:bg-black" style={{ backgroundColor: 'var(--bg-muted)', color: 'var(--text)' }}>
              POWERFUL FEATURES
            </div>
            <h2 className="text-4xl sm:text-5xl font-display font-bold mb-4" style={{ color: 'var(--text)' }}>
              Everything you need to manage maintenance
            </h2>
            <p className="text-xl max-w-2xl mx-auto" style={{ color: 'var(--text-muted)' }}>
              Powerful features designed to make equipment maintenance simple and efficient.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group relative p-8 rounded-2xl border hover:shadow-2xl transition-all duration-300 overflow-hidden"
                style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
              >
                <div className="absolute top-0 right-0 w-32 h-32 rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(to bottom right, var(--primary-100), transparent)' }}></div>
                <div className="relative">
                  <div className="w-14 h-14 bg-primary-600 rounded-xl flex items-center justify-center text-text mb-5 shadow-md group-hover:scale-110 transition-transform duration-300">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold mb-3" style={{ color: 'var(--text)' }}>
                    {feature.title}
                  </h3>
                  <p className="leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 relative overflow-hidden" style={{ backgroundColor: 'var(--bg-muted)' }}>
        <div className="absolute top-0 left-0 w-64 h-64 rounded-full filter blur-3xl opacity-20" style={{ background: 'var(--primary-200)' }}></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full filter blur-3xl opacity-20" style={{ background: 'var(--secondary-300)' }}></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-block px-4 py-2 rounded-full text-sm font-semibold mb-4" style={{ backgroundColor: 'var(--card)', color: 'var(--text)' }}>
                PROVEN RESULTS
              </div>
              <h2 className="text-4xl sm:text-5xl font-display font-bold mb-6 leading-tight" style={{ color: 'var(--text)' }}>
                Reduce costs and increase efficiency
              </h2>
              <p className="text-lg mb-8 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                GearGuard helps organizations optimize their maintenance operations and maximize equipment uptime with data-driven insights and automation.
              </p>

              <div className="space-y-4 mb-8">
                {[
                  { text: 'Zero-Gap Compliance: Ensure every asset meets 100% of regulatory safety standards automatically.' },
                  { text: 'Zero-Manual Entry: Intelligent Auto-Fill pulls equipment history instantly.' },
                  { text: 'Predictive Cost Shield: Identify failing assets algorithms before catastrophic failures.' },
                  { text: 'Technician Autonomy: Mobile-first workflows for duration and completion recording.' }
                ].map((item, index) => (
                  <div key={index} className="flex items-start gap-4 rounded-lg p-4 shadow-sm border" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                    <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5" style={{ backgroundColor: 'var(--bg-muted)' }}>
                      <CheckCircle2 size={16} style={{ color: 'var(--text)', backgroundColor: 'var(--bg-muted)' }}/>
                    </div>
                    <span className="font-medium" style={{ color: 'var(--text)' }}>{item.text}</span>
                  </div>
                ))}
              </div>

              <Link to="/signup">
                <Button size="large" variant="contained" color="primary" className="shadow-lg">
                  Get Started Now
                </Button>
              </Link>
            </div>

            <div className="relative">
              <div className="relative rounded-3xl p-1 shadow-2xl" style={{ backgroundColor: 'var(--card)' }}>
                <div className="rounded-3xl p-8" style={{ backgroundColor: 'var(--card)' }}>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: 'var(--bg-muted)' }}>
                      <div className="w-16 h-16 bg-primary-700 rounded-full flex items-center justify-center mx-auto mb-4">
                        <TrendingUp size={32} className="text-white" />
                      </div>
                      <p className="text-3xl font-bold mb-1" style={{ color: 'var(--text)' }}>99.9%</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Asset Reliability</p>
                    </div>
                    <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: 'var(--bg-muted)' }}>
                      <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users size={32} className="text-white" />
                      </div>
                      <p className="text-3xl font-bold mb-1" style={{ color: 'var(--text)' }}>95%</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Team Utilization</p>
                    </div>
                    <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: 'var(--bg-muted)' }}>
                      <div className="w-16 h-16 bg-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock size={32} className="text-white" />
                      </div>
                      <p className="text-3xl font-bold mb-1" style={{ color: 'var(--text)' }}>1.2h</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>MTTR</p>
                    </div>
                    <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: 'var(--bg-muted)' }}>
                      <div className="w-16 h-16 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Shield size={32} className="text-white" />
                      </div>
                      <p className="text-3xl font-bold mb-1" style={{ color: 'var(--text)' }}>$0</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cost of Inaction</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden" style={{ background: 'var(--primary-700)' }}>
        <div className="absolute inset-0 opacity-30"></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl sm:text-5xl font-display font-bold text-white mb-6">
            Ready to optimize your maintenance?
          </h2>
          <p className="text-xl text-white mb-10 max-w-2xl mx-auto leading-relaxed">
            Join hundreds of companies already using GearGuard to streamline their operations and reduce costs.
          </p>
          <Link to="/signup">
            <Button size="large" variant="contained" className="hover:shadow-3xl" style={{ backgroundColor: 'var(--secondary-100)', color: 'var(--primary-700)' }}>
              Join In Now!!
            </Button>
          </Link>
          <p className="mt-6 text-white text-sm">No credit card required • 14-day free trial • Cancel anytime</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-white py-16" style={{ backgroundColor: 'var(--secondary-900)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1">
              <div className="flex items-center gap-3 mb-4">
                  {/* <Logo /> */}
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                The ultimate maintenance tracking solution for modern businesses.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-white">Product</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-white">Company</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-white">Legal</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t pt-8 text-center text-sm text-gray-400" style={{ borderColor: 'var(--border)' }}>
            <p>&copy; {new Date().getFullYear()} GearGuard. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
